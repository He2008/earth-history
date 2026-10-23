import { nanoid } from 'nanoid';
import { config, loadConfig, type Config } from '@/lib/config';
import { cacheKey } from '@/lib/cache-key';
import { placeDisplayName, type Direction, type PlaceInput, type ResearchInput } from '@/lib/types';
import { SEARCH_PRICES, LLM_PRICES } from '@/lib/prices';
import { getRepo, type Repo } from '@/server/db/repo';
import type { LlmProvider, ChatMsg } from '@/server/providers/llm/types';
import { createLlmChain } from '@/server/providers/llm/chain';
import { createDeepSeek } from '@/server/providers/llm/deepseek';
import { createQwen } from '@/server/providers/llm/qwen';
import type { SearchChain } from '@/server/providers/search/chain';
import { createSearchChain } from '@/server/providers/search/chain';
import { createBocha } from '@/server/providers/search/bocha';
import { createZhipu } from '@/server/providers/search/zhipu';
import type { Fetcher } from '@/server/providers/fetch/fetcher';
import { createFetcher, RobotsGuard } from '@/server/providers/fetch/fetcher';
import { planningMessages, synthesisMessages, scarceMessages, parsePlan } from '@/private/prompts';
import { buildSourcePack, validateCitations } from './citations';
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
  const searchChain =
    cfg.SEARCH_MODE === 'zhipu'
      ? [createZhipu('zhipu_std', () => cfg.ZHIPU_API_KEY), createBocha(() => cfg.BOCHA_API_KEY)]
      : [createBocha(() => cfg.BOCHA_API_KEY), createZhipu('zhipu_std', () => cfg.ZHIPU_API_KEY)];
  return {
    cfg,
    llm: createLlmChain([createDeepSeek(), createQwen()]),
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
  return s;
}

export async function runTask(taskId: string, deps: PipelineDeps, signal?: AbortSignal): Promise<void> {
  const { repo, cfg } = deps;
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const searchCalls: Record<string, number> = {};
  let tokIn = 0, tokOut = 0;

  const cost = () => {
    let yuan = 0;
    for (const [e, n] of Object.entries(searchCalls)) yuan += (SEARCH_PRICES[e as keyof typeof SEARCH_PRICES] ?? 0) * n;
    yuan += tokIn * LLM_PRICES.deepseek.in + tokOut * LLM_PRICES.deepseek.out;
    return { searchCalls, llmTokens: { in: tokIn, out: tokOut }, yuan: Number(yuan.toFixed(4)) };
  };

  const emit = (event: string, data: unknown) => bus.emit(taskId, event, data);
  const phase = (status: string, note: string, round?: number) => {
    repo.updateTask(taskId, { status });
    repo.appendTimeline(taskId, { phase: status, note, round, ts: Date.now() });
    emit('progress', { phase: status, round, note, ts: Date.now() });
  };
  const finish = (status: 'completed' | 'scarce' | 'failed', extra: Record<string, unknown>) => {
    repo.updateTask(taskId, { status, finished_at: Date.now(), ...extra, cost_json: JSON.stringify(cost()), timings_json: JSON.stringify({ ...timings, totalMs: Date.now() - t0 }) });
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
      const call = deps.llm.chatStream({ model: cfg.DEEPSEEK_MODEL, messages: planningMessages(promptPlace, task.direction as Direction, task.extra_instruction ?? undefined), temperature: 0.3, signal });
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
    const kept = new Map<string, { hit: SearchHit; subQ: number }>();
    const coverage = new Array<number>(plan.length).fill(0);
    let anySearchOk = false;
    let round = 0;
    while (round < 6 && Date.now() - ts < BUDGETS_MS.searchTotal) {
      const open = plan.map((_, i) => i).filter((i) => coverage[i] < 2);
      if (round >= 2 && open.length === 0) break;
      round++;
      const targets = (open.length ? open : plan.map((_, i) => i)).slice(0, 3);
      const queries = targets.map((i) => `${task.place_name} ${plan[i]}`);
      const results = await Promise.allSettled(queries.map((q) => deps.search.search(q, { count: 10, signal })));
      const fresh: SearchHit[] = [];
      results.forEach((r, qi) => {
        if (r.status !== 'fulfilled') return;
        anySearchOk = true;
        searchCalls[r.value.engine] = (searchCalls[r.value.engine] ?? 0) + 1;
        for (const h of r.value.hits) {
          const subQ = targets[qi];
          const prev = kept.get(h.urlNorm);
          if (prev) { coverage[prev.subQ]++; continue; }
          kept.set(h.urlNorm, { hit: h, subQ });
          fresh.push(h);
          coverage[subQ]++;
        }
      });
      for (const h of fresh) {
        repo.insertSource({ task_id: taskId, idx: null, stage: 'candidate', title: h.title, url: h.url, url_norm: h.urlNorm, snippet: h.snippet, published_at: h.publishedAt ?? null, engine: h.engine, score: null, fetched_chars: null, quote: null });
      }
      emit('search_hit', { round, query: queries[0], engine: results[0]?.status === 'fulfilled' ? results[0].value.engine : null, found: fresh.length, kept: fresh.slice(0, 5).map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })) });
      repo.appendTimeline(taskId, { phase: 'searching', note: `第 ${round} 轮检索,新增 ${fresh.length} 源`, round, ts: Date.now() });
      if (!open.length) break;
    }
    timings.searchingMs = Date.now() - ts;
    if (kept.size === 0 && !anySearchOk) throw new SearchAllFailedError('所有轮次搜索均失败');

    const keptList = [...kept.values()]
      .map((v) => ({ hit: v.hit, score: scoreHit(v.hit, task.place_name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.REPORT_MAX_SOURCES)
      .map((x, i) => ({ ...x.hit, idx: i + 1, score: x.score }));
    repo.dropCandidates(taskId);
    const rowIdByUrlNorm = new Map<string, number>();
    for (const k of keptList) {
      const rowId = repo.insertSource({ task_id: taskId, idx: k.idx, stage: 'kept', title: k.title, url: k.url, url_norm: k.urlNorm, snippet: k.snippet, published_at: k.publishedAt ?? null, engine: k.engine, score: k.score, fetched_chars: null, quote: null });
      rowIdByUrlNorm.set(k.urlNorm, rowId);
    }

    const synthesize = async (msgs: ChatMsg[]): Promise<string> => {
      phase('synthesizing', '综合成文');
      const tSyn = Date.now();
      const call = deps.llm.chatStream({ model: cfg.DEEPSEEK_MODEL, messages: msgs, temperature: 0.5, maxTokens: 4096, signal });
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

    if (keptList.length < cfg.SCARCITY_THRESHOLD) {
      // ---- scarce 降级 ----
      scarcity = true; finalStatus = 'scarce';
      repo.updateTask(taskId, { status: 'scarce' });
      repo.appendTimeline(taskId, { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      emit('progress', { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      const adminCtx = [place.province, place.city, place.county, place.village].filter(Boolean).join('');
      const raw = await synthesize(scarceMessages(promptPlace, adminCtx, keptList.map((s) => s.snippet).join('\n')));
      finalMd = `> ⚠️ 公开资料稀缺,以下为该地行政区划与地理背景,不含未经证实的细节。\n\n${raw.trim()}\n\n## 来源\n${keptList.map((s) => `${s.idx}. [${s.title}](${s.url})`).join('\n')}\n`;
    } else {
      // ---- fetching ----
      const tf = Date.now();
      phase('fetching', `抓取前 ${Math.min(keptList.length, cfg.REPORT_MAX_SOURCES)} 个来源正文`);
      const pages: string[] = [];
      const queue = [...keptList];
      const workers = Array.from({ length: Math.min(cfg.FETCH_CONCURRENCY, queue.length) }, async () => {
        while (queue.length && Date.now() - tf < BUDGETS_MS.fetchTotal) {
          const s = queue.shift()!;
          const page = await deps.fetcher.fetch(s.url, signal);
          const rowId = rowIdByUrlNorm.get(s.urlNorm)!;
          if (page.ok) {
            pages.push(`[${s.idx}] ${page.title}\n${page.text.slice(0, 1500)}`);
            repo.updateSource(rowId, { stage: 'fetched', fetched_chars: page.chars });
          }
        }
      });
      await Promise.all(workers);
      timings.fetchingMs = Date.now() - tf;

      // ---- synthesizing ----
      const raw = await synthesize(synthesisMessages(promptPlace, task.direction as Direction, plan, buildSourcePack(keptList), pages.join('\n\n')));
      const { report, invalidCount } = validateCitations(raw, keptList.length);
      if (invalidCount > 0) repo.appendTimeline(taskId, { phase: 'synthesizing', note: `剔除 ${invalidCount} 个无效引用标记`, ts: Date.now() });
      finalStatus = 'completed';
      finalMd = `${report.trim()}\n\n## 来源\n${keptList.map((s) => `${s.idx}. [${s.title}](${s.url})`).join('\n')}\n`;
    }

    repo.updateTask(taskId, { report_md: finalMd });
    for (const s of keptList) {
      const rowId = rowIdByUrlNorm.get(s.urlNorm);
      if (rowId && finalMd.includes(`[${s.idx}]`)) repo.updateSource(rowId, { stage: 'cited' });
    }
    emit('sources', { items: keptList.map((s) => ({ idx: s.idx, title: s.title, url: s.url, site: new URL(s.url).hostname, date: s.publishedAt ?? null })) });
    finish(finalStatus, { share_token: nanoid(12) });
    repo.cachePut(cacheKey(place.county, task.lat, task.lng, task.direction), taskId);
    emit('done', { taskId, status: finalStatus, elapsedMs: Date.now() - t0, sourcesKept: keptList.length, scarcity, yuan: cost().yuan });
  } catch (e) {
    const code = e instanceof LlmAllFailedError ? 'llm_all_failed'
      : e instanceof SearchAllFailedError ? 'search_all_failed'
      : (e as Error)?.name === 'AbortError' ? 'timeout'
      : 'internal';
    finish('failed', { error_code: code, error_msg: (e as Error)?.message ?? String(e) });
    emit('error', { code, message: (e as Error)?.message ?? String(e), retryable: code !== 'internal' });
  }
}

export async function startResearch(input: ResearchInput): Promise<{ taskId: string; cached: boolean }> {
  const deps = defaultDeps();
  const key = cacheKey(input.place.county, input.lat, input.lng, input.direction);
  const hit = deps.repo.cacheGet(key);
  if (hit) return { taskId: hit.task_id, cached: true };
  const id = nanoid(12);
  deps.repo.createTask({ id, place_name: placeDisplayName(input.place), place_json: JSON.stringify(input.place), lat: input.lat, lng: input.lng, direction: input.direction, extra_instruction: input.extra });
  const ac = registry.register(id);
  void runTask(id, deps, ac.signal).finally(() => registry.release(id));
  return { taskId: id, cached: false };
}
