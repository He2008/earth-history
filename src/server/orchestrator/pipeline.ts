import { nanoid } from 'nanoid';
import { config, loadConfig, type Config } from '@/lib/config';
import { cacheKey } from '@/lib/cache-key';
import { placeDisplayName, type Direction, type PlaceInput, type ResearchInput } from '@/lib/types';
import { SEARCH_PRICES, LLM_PRICES } from '@/lib/prices';
import { getRepo, type Repo } from '@/server/db/repo';
import type { LlmProvider, ChatMsg } from '@/server/providers/llm/types';
import { createLlmChain } from '@/server/providers/llm/chain';
import { createDeepSeek } from '@/server/providers/llm/deepseek';
import type { SearchChain } from '@/server/providers/search/chain';
import { createSearchChain } from '@/server/providers/search/chain';
import { createBocha } from '@/server/providers/search/bocha';
import { createZhipu } from '@/server/providers/search/zhipu';
import { createDeepSeekSearch } from '@/server/providers/search/deepseek';
import type { Fetcher } from '@/server/providers/fetch/fetcher';
import { createFetcher, RobotsGuard } from '@/server/providers/fetch/fetcher';
import { planningMessages, synthesisMessages, scarceMessages, parsePlan } from '@/private/prompts';
import { log } from '@/server/obs/log';
import { estimateMinutesSaved, type ResearchMetrics } from '@/lib/metrics';
import { buildSourcePack, validateCitations, sourceTitle, extractCitedSentence, hasCitation } from './citations';
import { bus } from './events';
import { registry, BUDGETS_MS } from './machine';
import type { SearchHit } from '@/server/providers/search/types';
import { LlmAllFailedError } from '@/server/providers/llm/types';
import { SearchAllFailedError } from '@/server/providers/search/types';

export interface PipelineDeps {
  llm: LlmProvider;
  search: SearchChain;
  fetcher: Fetcher;
  repo: Repo;
  cfg: Config;
}

export function defaultDeps(): PipelineDeps {
  const cfg = config;
  // 搜索链:默认 deepseek 主力、博查兜底;bocha/zhipu 模式供 M0 A/B;ab = 三家全链
  const bocha = createBocha(() => cfg.BOCHA_API_KEY);
  const zhipuStd = createZhipu('zhipu_std', () => cfg.ZHIPU_API_KEY);
  const deepseek = createDeepSeekSearch(() => cfg.DEEPSEEK_API_KEY);
  const searchChain =
    cfg.SEARCH_MODE === 'bocha' ? [bocha, zhipuStd]
    : cfg.SEARCH_MODE === 'zhipu' ? [zhipuStd, bocha]
    : cfg.SEARCH_MODE === 'ab' ? [deepseek, bocha, zhipuStd]
    : [deepseek, bocha]; // 'deepseek'(默认)
  return {
    cfg,
    llm: createLlmChain([createDeepSeek()]), // 单 DeepSeek;智谱 GLM 备用适配器保留(glm.ts),需要时重新接线
    search: createSearchChain(searchChain),
    fetcher: createFetcher(new RobotsGuard()),
    repo: getRepo(),
  };
}

function domainWeight(host: string): number {
  if (/\.gov(\.cn)?$/.test(host)) return 2;
  if (/\.edu(\.cn)?$/.test(host)) return 2;
  if (/zhihu\.com$/.test(host)) return 1;
  if (/baike\.(baidu|sogou)\.com$/.test(host)) return 1;
  if (/wikipedia\.org$/.test(host)) return 1;
  if (/weibo\.com$/.test(host)) return -1;
  return 0;
}

export function scoreHit(hit: SearchHit, placeName: string): number {
  let s = 0;
  try { s += domainWeight(new URL(hit.url).hostname); } catch { /* bad url */ }
  if (hit.title.includes(placeName)) s += 2;
  if (hit.snippet.includes(placeName)) s += 1;
  if (hit.title.length > 60) s -= 0.5;
  if (/[<{]/.test(hit.title)) s -= 3; // 标题带 HTML 残片,多为表格/登记类垃圾页,重度降权
  return s;
}

// 缺口补查换 query:同一问点重查时逐轮换措辞,避免同词重发拿回同一批结果(稀疏地点覆盖退化主因)
const QUERY_VARIANTS = ['', ' 历史资料', ' 百科', ' 概况', ' 地方志'];

// 组合任务信号与阶段预算上限:任一触发即中止(Node ≥20.3 AbortSignal.any)
const withBudget = (signal: AbortSignal | undefined, ms: number): AbortSignal =>
  AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(ms)]);

// 来源行(百科参考资料格式):`n. [标题](url) ．站点 [日期]`,渲染层据此出徽标/favicon/回跳
const refLine = (s: { idx: number; title: string; urlNorm: string; publishedAt?: string | null }): string => {
  let host = '';
  try { host = new URL(s.urlNorm).hostname; } catch { host = ''; }
  const date = /^\d{4}-\d{2}-\d{2}/.exec(s.publishedAt ?? '')?.[0]; // ISO 带时区尾巴,只取日期
  return `${s.idx}. [${s.title}](${s.urlNorm})${host ? ` ．${host}` : ''}${date ? ` [${date}]` : ''}`;
};

export async function runTask(taskId: string, deps: PipelineDeps, signal?: AbortSignal): Promise<void> {
  const { repo, cfg } = deps;
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const searchCalls: Record<string, number> = {};
  let tokIn = 0, tokOut = 0;
  let charsRead = 0; // 人工等价阅读量:已抓正文全量 + 未抓来源以 snippet 计(节省指标口径)
  let keptCount = 0; // catch 路径下闭包安全(planning 期失败时 keptList 尚未初始化)

  const cost = () => {
    let yuan = 0;
    for (const [e, n] of Object.entries(searchCalls)) yuan += (SEARCH_PRICES[e as keyof typeof SEARCH_PRICES] ?? 0) * n;
    yuan += tokIn * LLM_PRICES.deepseek.in + tokOut * LLM_PRICES.deepseek.out;
    return { searchCalls, llmTokens: { in: tokIn, out: tokOut }, yuan: Number(yuan.toFixed(4)) };
  };
  const metrics = (reportChars: number): ResearchMetrics => ({
    sourcesKept: keptCount,
    charsRead,
    minutesSaved: estimateMinutesSaved({ sourcesKept: keptCount, reportChars }),
  });

  const emit = (event: string, data: unknown) => bus.emit(taskId, event, data);
  const phase = (status: string, note: string, round?: number) => {
    repo.updateTask(taskId, { status });
    repo.appendTimeline(taskId, { phase: status, note, round, ts: Date.now() });
    emit('progress', { phase: status, round, note, ts: Date.now() });
  };
  const finish = (status: 'completed' | 'scarce' | 'failed', extra: Record<string, unknown>, reportChars = 0) => {
    repo.updateTask(taskId, { status, finished_at: Date.now(), ...extra, cost_json: JSON.stringify({ ...cost(), metrics: metrics(reportChars) }), timings_json: JSON.stringify({ ...timings, totalMs: Date.now() - t0 }) });
  };

  try {
    const task = repo.getTask(taskId);
    if (!task) return;
    const place = JSON.parse(task.place_json) as PlaceInput;
    const promptPlace = { name: task.place_name, province: place.province, county: place.county };

    // ---- planning ----
    const tp = Date.now();
    phase('planning', '正在拆解研究子问题');
    let plan: string[];
    {
      const call = deps.llm.chatStream({ messages: planningMessages(promptPlace, task.direction as Direction, task.extra_instruction ?? undefined), temperature: 0.3, thinking: 'disabled', signal: withBudget(signal, BUDGETS_MS.planning) });
      let out = '';
      for await (const c of call.stream) out += c.delta ?? '';
      const u = await call.usage;
      tokIn += u.promptTokens; tokOut += u.completionTokens;
      plan = parsePlan(out);
      repo.updateTask(taskId, { plan_json: JSON.stringify(plan) });
    }
    timings.planningMs = Date.now() - tp;

    // ---- searching(自适应多轮) ----
    const ts = Date.now();
    phase('searching', '开始自适应检索', 0);
    const kept = new Map<string, SearchHit>();
    // 覆盖计数 = 每个子问题命中的不重复 URL 集合;重复命中也计入当前子问题,修稀疏地点的覆盖退化
    const covered = plan.map(() => new Set<string>());
    let anySearchOk = false;
    let round = 0;
    while (round < 6 && Date.now() - ts < BUDGETS_MS.searchTotal) {
      const open = plan.map((_, i) => i).filter((i) => covered[i].size < 2);
      if (open.length === 0 && round >= 1) break; // 首轮必跑;全覆盖后不再白跑复核轮
      round++;
      const targets = (open.length ? open : plan.map((_, i) => i)).slice(0, 3);
      const variant = QUERY_VARIANTS[(round - 1) % QUERY_VARIANTS.length];
      const queries = targets.map((i) => `${task.place_name} ${plan[i]}${variant}`);
      const results = await Promise.allSettled(queries.map((q) => deps.search.search(q, { count: 10, signal })));
      const fresh: (SearchHit & { idx: number })[] = [];
      let candidateIdx = kept.size; // 候选序号:跨轮累计,契约 §6 search_hit.kept[].idx
      results.forEach((r, qi) => {
        if (r.status !== 'fulfilled') return;
        anySearchOk = true;
        searchCalls[r.value.engine] = (searchCalls[r.value.engine] ?? 0) + 1;
        for (const h of r.value.hits) {
          covered[targets[qi]].add(h.urlNorm);
          if (kept.has(h.urlNorm)) continue;
          kept.set(h.urlNorm, h);
          fresh.push({ ...h, idx: ++candidateIdx });
        }
      });
      for (const h of fresh) {
        repo.insertSource({ task_id: taskId, idx: null, stage: 'candidate', title: h.title, url: h.url, url_norm: h.urlNorm, snippet: h.snippet, published_at: h.publishedAt ?? null, engine: h.engine, score: null, fetched_chars: null, quote: null });
      }
      emit('search_hit', { round, query: queries[0], engine: results[0]?.status === 'fulfilled' ? results[0].value.engine : null, found: fresh.length, kept: fresh.slice(0, 5).map((h) => ({ idx: h.idx, title: h.title, url: h.url, snippet: h.snippet })) });
      repo.appendTimeline(taskId, { phase: 'searching', note: `第 ${round} 轮检索,新增 ${fresh.length} 源`, round, ts: Date.now() });
    }
    timings.searchingMs = Date.now() - ts;
    if (kept.size === 0 && !anySearchOk) throw new SearchAllFailedError('所有轮次搜索均失败');

    const keptList = [...kept.values()]
      .map((hit) => ({ hit, score: scoreHit(hit, task.place_name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.REPORT_MAX_SOURCES)
      .map((x, i) => ({ ...x.hit, title: sourceTitle(x.hit), idx: i + 1, score: x.score }));
    keptCount = keptList.length;
    repo.dropCandidates(taskId);
    const rowIdByUrlNorm = new Map<string, number>();
    for (const k of keptList) {
      const rowId = repo.insertSource({ task_id: taskId, idx: k.idx, stage: 'kept', title: k.title, url: k.url, url_norm: k.urlNorm, snippet: k.snippet, published_at: k.publishedAt ?? null, engine: k.engine, score: k.score, fetched_chars: null, quote: null });
      rowIdByUrlNorm.set(k.urlNorm, rowId);
    }

    const synthesize = async (msgs: ChatMsg[], budgetMs: number, holdPhase?: string): Promise<string> => {
      phase(holdPhase ?? 'synthesizing', holdPhase === 'scarce' ? '降级综合成文(资料稀缺)' : '综合成文');
      const tSyn = Date.now();
      // 思考型模型必须关思考,否则推理吃光配额导致正文为空;上限 8192 留足正文空间
      const call = deps.llm.chatStream({ messages: msgs, temperature: 0.5, maxTokens: 8192, thinking: 'disabled', signal: withBudget(signal, budgetMs) });
      let full = '', held = '';
      for await (const c of call.stream) {
        const d = c.delta ?? '';
        if (!d) continue;
        full += d; held += d;
        emit('content', { delta: d });
        if (held.length >= 2048) { repo.saveReportDelta(taskId, held); held = ''; }
      }
      if (held) repo.saveReportDelta(taskId, held);
      const u = await call.usage;
      tokIn += u.promptTokens; tokOut += u.completionTokens;
      timings.synthesizingMs = Date.now() - tSyn;
      return full;
    };

    let finalStatus: 'completed' | 'scarce';
    let finalMd: string;
    let scarcity = false;
    let citedBody: string | null = null; // 引用校验后的正文(不含来源附录),被引单句从这里提取

    if (keptList.length < cfg.SCARCITY_THRESHOLD) {
      // ---- scarce 降级 ----
      scarcity = true; finalStatus = 'scarce';
      charsRead = keptList.reduce((a, s) => a + s.snippet.length, 0); // 稀缺降级只读摘要
      repo.updateTask(taskId, { status: 'scarce' });
      repo.appendTimeline(taskId, { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      emit('progress', { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      const adminCtx = [place.province, place.city, place.county, place.village].filter(Boolean).join('');
      const raw = await synthesize(scarceMessages(promptPlace, adminCtx, keptList.map((s) => s.snippet).join('\n')), BUDGETS_MS.scarce, 'scarce'); // 相位持留 scarce,不再途经 synthesizing
      finalMd = `> ⚠️ 公开资料稀缺,以下为该地行政区划与地理背景,不含未经证实的细节。\n\n${raw.trim()}\n\n## 来源\n${keptList.map((s) => refLine(s)).join('\n')}\n`;
    } else {
      // ---- fetching ----
      const tf = Date.now();
      phase('fetching', `抓取前 ${Math.min(keptList.length, cfg.REPORT_MAX_SOURCES)} 个来源正文`);
      const pages: string[] = [];
      const failReasons: Record<string, number> = {};
      const fetchedUrls = new Set<string>();
      const queue = [...keptList];
      const workers = Array.from({ length: Math.min(cfg.FETCH_CONCURRENCY, queue.length) }, async () => {
        while (queue.length && Date.now() - tf < BUDGETS_MS.fetchTotal) {
          const s = queue.shift()!;
          log.debug('fetch.start', { taskId, idx: s.idx, urlNorm: s.urlNorm }); // 卡死定位探针(默认关)
          const page = await deps.fetcher.fetch(s.url, signal);
          const rowId = rowIdByUrlNorm.get(s.urlNorm)!;
          if (page.ok) {
            pages.push(`[${s.idx}] ${page.title}\n${page.text.slice(0, 1500)}`);
            repo.updateSource(rowId, { stage: 'fetched', fetched_chars: page.chars });
            fetchedUrls.add(s.urlNorm);
            charsRead += page.chars;
          } else {
            const reason = page.reason ?? 'error';
            failReasons[reason] = (failReasons[reason] ?? 0) + 1;
            log.warn('fetch.fail', { taskId, idx: s.idx, urlNorm: s.urlNorm, reason });
          }
        }
      });
      await Promise.all(workers);
      for (const s of keptList) if (!fetchedUrls.has(s.urlNorm)) charsRead += s.snippet.length; // 未抓到正文的以摘要计
      timings.fetchingMs = Date.now() - tf;
      const failCount = Object.values(failReasons).reduce((a, b) => a + b, 0);
      log.info('fetch.summary', { taskId, ok: pages.length, fail: failCount, reasons: failReasons });
      if (failCount > 0) repo.appendTimeline(taskId, { phase: 'fetching', note: `抓取:成功 ${pages.length} / 失败 ${failCount}(${Object.entries(failReasons).map(([r, n]) => `${r}:${n}`).join(', ')})`, ts: Date.now() });

      // ---- synthesizing ----
      const raw = await synthesize(synthesisMessages(promptPlace, task.direction as Direction, plan, buildSourcePack(keptList), pages.join('\n\n')), BUDGETS_MS.synthesize);
      const { report, invalidCount } = validateCitations(raw, keptList.length);
      citedBody = report;
      if (invalidCount > 0) {
        const totalMarks = (raw.match(/\[\d{1,3}\]/g) ?? []).length;
        repo.appendTimeline(taskId, { phase: 'synthesizing', note: `剔除 ${invalidCount} 个无效引用标记`, ts: Date.now() });
        log.warn('citations.invalid', { taskId, invalidCount });
        // >20% 无效引用记 quality flag(Backlog:盲评也要能看到)
        if (totalMarks > 0 && invalidCount / totalMarks > 0.2) repo.appendTimeline(taskId, { phase: 'synthesizing', note: `quality_flag: 无效引用占比 ${Math.round((invalidCount / totalMarks) * 100)}%`, ts: Date.now() });
      }
      finalStatus = 'completed';
      finalMd = `${report.trim()}\n\n## 来源\n${keptList.map((s) => refLine(s)).join('\n')}\n`;
    }

    repo.updateTask(taskId, { report_md: finalMd });
    for (const s of keptList) {
      const rowId = rowIdByUrlNorm.get(s.urlNorm);
      // 被引单句回写 quote 列(≤200 字,来源核查用);scarce 降级无正文引用,quote 留空
      if (rowId && hasCitation(finalMd, s.idx)) repo.updateSource(rowId, { stage: 'cited', quote: citedBody === null ? null : extractCitedSentence(citedBody, s.idx) });
    }
    emit('sources', { items: keptList.map((s) => ({ idx: s.idx, title: s.title, url: s.urlNorm, site: new URL(s.url).hostname, date: s.publishedAt ?? null })) });
    finish(finalStatus, { share_token: nanoid(12) }, finalMd.length);
    repo.cachePut(cacheKey(place.county, task.lat, task.lng, task.direction), taskId);
    emit('done', { taskId, status: finalStatus, elapsedMs: Date.now() - t0, sourcesKept: keptList.length, scarcity, yuan: cost().yuan, reportChars: finalMd.length });
  } catch (e) {
    const code = e instanceof LlmAllFailedError ? 'llm_all_failed'
      : e instanceof SearchAllFailedError ? 'search_all_failed'
      : (e as Error)?.name === 'AbortError' ? 'timeout'
      : 'internal';
    const msg = ((e as Error)?.message ?? String(e)).slice(0, 200); // 单行降噪,不打印 stack
    repo.appendTimeline(taskId, { phase: 'failed', note: `${code}: ${msg}`, ts: Date.now() });
    finish('failed', { error_code: code, error_msg: (e as Error)?.message ?? String(e) });
    emit('error', { code, message: (e as Error)?.message ?? String(e), retryable: code !== 'internal' });
  }
}

const TERMINAL_STATUS = new Set(['completed', 'scarce', 'failed']);
const inflightByKey = new Map<string, string>(); // 并发同 key 去重:运行中任务的 cacheKey → taskId

export async function startResearch(input: ResearchInput, deps: PipelineDeps = defaultDeps(), onCreated?: (taskId: string) => void): Promise<{ taskId: string; cached: boolean }> {
  const key = cacheKey(input.place.county, input.lat, input.lng, input.direction);
  const hit = deps.repo.cacheGet(key);
  if (hit) {
    log.info('task.cache_hit', { taskId: hit.task_id, place: placeDisplayName(input.place), direction: input.direction });
    return { taskId: hit.task_id, cached: true };
  }
  const running = inflightByKey.get(key); // 同 key 并发:并入运行中任务,不建第二个
  if (running) {
    const t = deps.repo.getTask(running);
    if (t && !TERMINAL_STATUS.has(t.status)) return { taskId: running, cached: false };
    return { taskId: running, cached: true }; // 刚终态、缓存尚未可见的窗口:按回放处理
  }
  const id = nanoid(12);
  log.info('task.start', { taskId: id, place: placeDisplayName(input.place), direction: input.direction });
  deps.repo.createTask({ id, place_name: placeDisplayName(input.place), place_json: JSON.stringify(input.place), lat: input.lat, lng: input.lng, direction: input.direction, extra_instruction: input.extra });
  inflightByKey.set(key, id); // 以下至 set 无 await,单线程内无竞态
  onCreated?.(id); // 订阅窗口:任务已落库、管线未启动,SSE 首事件不丢
  const ac = registry.register(id);
  const hardTimer = setTimeout(() => registry.abort(id), BUDGETS_MS.taskHard); // 硬上限看门狗:abort → AbortError → catch 归为 timeout
  void runTask(id, deps, ac.signal)
    .catch(() => {}) // runTask 自身已兜底;此处防御性吞掉意外 rejection,finally 仍执行
    .finally(() => { clearTimeout(hardTimer); registry.release(id); inflightByKey.delete(key); });
  return { taskId: id, cached: false };
}
