import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '@/server/db/client';
import { createRepo, type Repo } from '@/server/db/repo';
import { runTask, type PipelineDeps } from '@/server/orchestrator/pipeline';
import { bus } from '@/server/orchestrator/events';
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
});
