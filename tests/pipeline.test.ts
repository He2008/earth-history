import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '@/server/db/client';
import { createRepo, type Repo } from '@/server/db/repo';
import { runTask, scoreHit, type PipelineDeps } from '@/server/orchestrator/pipeline';
import { bus } from '@/server/orchestrator/events';
import { __captureLogsForTests } from '@/server/obs/log';
import { loadConfig } from '@/lib/config';
import type { LlmProvider, LlmRequest, LlmCall } from '@/server/providers/llm/types';
import { createLlmChain } from '@/server/providers/llm/chain';
import type { SearchChain } from '@/server/providers/search/chain';
import type { Fetcher, FetchedPage } from '@/server/providers/fetch/fetcher';
import type Database from 'better-sqlite3';

let db: Database.Database, repo: Repo;
beforeEach(() => {
  db = openDb(':memory:'); migrate(db);
  repo = createRepo(db);
});

const TASK = { id: 't1', place_name: '云南省大理州云龙县诺邓村', place_json: '{"province":"云南省","city":"大理州","county":"云龙县","village":"诺邓村"}', lat: 25.88, lng: 99.15, direction: '综合沿革' };

function fakeLlm(script: { plan: string; report: string }): LlmProvider {
  let calls = 0;
  return {
    name: 'deepseek',
    chatStream(req: LlmRequest): LlmCall {
      const isPlan = calls++ === 0;
      const text = isPlan ? script.plan : script.report;
      const parts = [text.slice(0, 5), text.slice(5)];
      let i = 0;
      return {
        usage: Promise.resolve({ promptTokens: 100, completionTokens: 200 }),
        stream: (async function* () { for (const p of parts) yield { delta: p }; })(),
      };
    },
  };
}

function fakeSearch(byQuery: (q: string) => { title: string; url: string; snippet: string }[]): SearchChain['search'] {
  return async (query) => ({ hits: byQuery(query).map((h) => ({ title: h.title, url: h.url, urlNorm: h.url, snippet: h.snippet, publishedAt: '2024-01-01', engine: 'bocha' as const })).slice(0, 10), engine: 'bocha' });
}

const noFetch: Fetcher = { fetch: async (url): Promise<FetchedPage> => ({ url, title: '页', text: '正文', chars: 2, ok: true }) };

function deps(over: Partial<PipelineDeps>): PipelineDeps {
  return { llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '## 建制沿革\n内容[1]。\n' }), search: { search: fakeSearch(() => [{ title: 'a', url: 'https://a/1', snippet: 's' }, { title: 'b', url: 'https://b/1', snippet: 's' }, { title: 'c', url: 'https://c/1', snippet: 's' }]) }, fetcher: noFetch, repo, cfg: loadConfig({}), ...over };
}

describe('runTask', () => {
  it('happy path: completed + 报告含来源列表 + 引用保留 + 缓存写入', async () => {
    repo.createTask(TASK);
    const events: string[] = [];
    bus.subscribe('t1', (e) => events.push(e.event));
    await runTask('t1', deps({}));
    const t = repo.getTask('t1')!;
    expect(t.status).toBe('completed');
    expect(t.report_md).toContain('## 建制沿革');
    expect(t.report_md).toContain('## 来源');
    expect(t.report_md).toContain('[1]');
    expect(t.share_token).toBeTruthy();
    expect(t.cost_json).toContain('"bocha"');
    expect(t.timings_json).toContain('totalMs');
    expect(events).toContain('progress');
    expect(events).toContain('search_hit');
    expect(events).toContain('done');
    expect(events).toContain('content');
  });
  it('kept < 3 → scarce 终态,报告带稀缺横幅', async () => {
    repo.createTask({ ...TASK, id: 't2' });
    const d = deps({ search: { search: async () => ({ hits: [{ title: '唯一', url: 'https://a/1', urlNorm: 'https://a/1', snippet: 's', engine: 'bocha' }], engine: 'bocha' }) } });
    await runTask('t2', d);
    const t = repo.getTask('t2')!;
    expect(t.status).toBe('scarce');
    expect(t.report_md).toContain('资料稀缺');
  });
  it('幻觉引用 [9] 被剔除', async () => {
    repo.createTask({ ...TASK, id: 't3' });
    await runTask('t3', deps({ llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '正文[1]与伪引[9]。\n' }) }));
    const t = repo.getTask('t3')!;
    expect(t.report_md).toContain('[1]');
    expect(t.report_md).not.toContain('[9]');
  });
  it('引用校验后被引单句回写 quote 列(来源核查用)', async () => {
    repo.createTask({ ...TASK, id: 't8' });
    await runTask('t8', deps({ llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '诺邓因盐而兴[1]。其余背景[2]。\n' }) }));
    const byStage = repo.listSources('t8');
    const q1 = byStage.find((s) => s.idx === 1)!;
    const q2 = byStage.find((s) => s.idx === 2)!;
    expect(q1.stage).toBe('cited');
    expect(q1.quote).toBe('诺邓因盐而兴[1]。');
    expect(q2.quote).toBe('其余背景[2]。');
    expect(byStage.find((s) => s.idx === 3)!.stage).not.toBe('cited'); // 未被正文引用不标 cited
  });
  it('来源列表带站点名与日期(百科参考资料格式)', async () => {
    repo.createTask({ ...TASK, id: 't12' });
    await runTask('t12', deps({ llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '正文[1]。\n' }) }));
    expect(repo.getTask('t12')!.report_md).toMatch(/## 来源\n1\. \[a\]\(https:\/\/a\/1\) ．a \[2024-01-01\]/);
  });
  it('cost_json 携带节省指标(sourcesKept/charsRead/minutesSaved),yuan 留遥测', async () => {
    repo.createTask({ ...TASK, id: 't13' });
    await runTask('t13', deps({ llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '正文[1]。\n' }) }));
    const c = JSON.parse(repo.getTask('t13')!.cost_json!);
    expect(c.yuan).toBeGreaterThan(0);
    expect(c.metrics).toMatchObject({ sourcesKept: 3, charsRead: expect.any(Number) });
    expect(c.metrics.minutesSaved).toBeGreaterThan(0);
  });
  it('搜索全抛错 → failed / search_all_failed', async () => {
    repo.createTask({ ...TASK, id: 't4' });
    const d = deps({ search: { search: async () => { throw new Error('down'); } } });
    await runTask('t4', d);
    const t = repo.getTask('t4')!;
    expect(t.status).toBe('failed');
    expect(t.error_code).toBe('search_all_failed');
  });
  it('LLM 全挂 → failed / llm_all_failed', async () => {
    repo.createTask({ ...TASK, id: 't5' });
    const badUsage = Promise.reject(new Error('x'));
    badUsage.catch(() => {}); // brief 修复:失败路径无人 await usage,静默避免 unhandled rejection(await 仍会收到拒绝)
    const badLlm: LlmProvider = { name: 'deepseek', chatStream: () => ({ usage: badUsage, stream: (async function* () { throw new Error('x'); })() }) };
    await runTask('t5', deps({ llm: createLlmChain([badLlm]) }));
    expect(repo.getTask('t5')!.error_code).toBe('llm_all_failed');
  });
  it('抓取失败:fetch.fail 逐条 warn + fetch.summary 汇总 + timeline 记失败分布', async () => {
    repo.createTask({ ...TASK, id: 't7' });
    const flaky: Fetcher = { fetch: async (url): Promise<FetchedPage> => url.includes('/b/')
      ? { url, title: '', text: '', chars: 0, ok: false, reason: 'http_403' }
      : { url, title: '页', text: '正文', chars: 2, ok: true } };
    const cap = __captureLogsForTests();
    try { await runTask('t7', deps({ fetcher: flaky })); } finally { cap.restore(); }
    expect(repo.getTask('t7')!.status).toBe('completed'); // 单源失败不毁任务
    const fails = cap.lines.filter((l) => l.event === 'fetch.fail');
    expect(fails).toHaveLength(1);
    expect((fails[0] as Record<string, unknown>).reason).toBe('http_403');
    const summary = cap.lines.find((l) => l.event === 'fetch.summary') as Record<string, unknown>;
    expect(summary.ok).toBe(2);
    expect(summary.fail).toBe(1);
    expect(summary.reasons).toEqual({ http_403: 1 });
    const tl = JSON.parse(repo.getTask('t7')!.timeline_json) as Array<{ note: string }>;
    expect(tl.some((e) => e.note.includes('http_403:1'))).toBe(true);
  });
  it('自适应轮次:第 2 轮覆盖后不再跑第 3 轮', async () => {
    repo.createTask({ ...TASK, id: 't6' });
    let round = 0;
    const search: SearchChain['search'] = async (q) => {
      round++;
      // 每个 query 返回 2 条不重复源 → 两个子问题在 R1 即覆盖,R2 复核后退出
      const hits = [1, 2].map((k) => ({ title: `${q}#${k}`, url: `https://x/${round}/${k}`, urlNorm: `https://x/${round}/${k}`, snippet: 's', publishedAt: undefined, engine: 'bocha' as const }));
      return { hits, engine: 'bocha' };
    };
    await runTask('t6', deps({ search: { search } }));
    const tl = JSON.parse(repo.getTask('t6')!.timeline_json) as Array<{ note: string }>;
    const roundNotes = tl.filter((e) => e.note.includes('轮'));
    expect(roundNotes.length).toBeLessThanOrEqual(2);
  });
  it('重复命中计入当前子问题:高度重叠结果单轮即闭环,不再白跑', async () => {
    repo.createTask({ ...TASK, id: 't9' });
    let calls = 0;
    // 两个子问题,搜索永远返回同一组 3 条 URL(稀疏地点典型:各引擎口径高度重叠)
    const search: SearchChain['search'] = async () => {
      calls++;
      return { hits: [1, 2, 3].map((k) => ({ title: `t${k}`, url: `https://o/${k}`, urlNorm: `https://o/${k}`, snippet: 's', publishedAt: undefined, engine: 'bocha' as const })), engine: 'bocha' };
    };
    await runTask('t9', deps({ search: { search } }));
    // 旧逻辑:重复 URL 只记首见子问题 → 子问题2永远缺口 → 白跑到轮次上限;新逻辑:R1 双双覆盖即退出
    expect(calls).toBe(2); // 2 子问题 × 1 轮
  });
  it('缺口补查换 query:第 2 轮起同问点追加变体词', async () => {
    repo.createTask({ ...TASK, id: 't10' });
    const seen: string[] = [];
    const search: SearchChain['search'] = async (q) => {
      seen.push(q);
      // R1 每问 1 条(缺口),R2 起每问 2 条新源 → R2 后闭环
      const r = seen.length <= 2 ? 1 : 2;
      const hits = Array.from({ length: r }, (_, k) => ({ title: `${q}#${k}`, url: `https://v/${seen.length}/${k}`, urlNorm: `https://v/${seen.length}/${k}`, snippet: 's', publishedAt: undefined, engine: 'bocha' as const }));
      return { hits, engine: 'bocha' };
    };
    await runTask('t10', deps({ search: { search } }));
    expect(seen).toHaveLength(4); // 2 轮 × 2 问
    expect(seen.slice(2).every((q) => /诺邓村 q[12] \S+$/.test(q))).toBe(true); // R2 换了措辞
  });
});

describe('scoreHit 垃圾标题降权', () => {
  it('标题带 HTML 残片重度降权(排到正常源之后)', () => {
    const junk = { title: '<table><tr><td>登记</td></tr></table>', url: 'https://gansu.chinatax.gov.cn/a', urlNorm: 'https://gansu.chinatax.gov.cn/a', snippet: '敦煌市', publishedAt: undefined, engine: 'deepseek' as const };
    const good = { title: '敦煌历史文化', url: 'https://www.dunhuang.gov.cn/a', urlNorm: 'https://www.dunhuang.gov.cn/a', snippet: '敦煌市', publishedAt: undefined, engine: 'deepseek' as const };
    expect(scoreHit(junk, '敦煌市')).toBeLessThan(scoreHit(good, '敦煌市'));
  });
});
