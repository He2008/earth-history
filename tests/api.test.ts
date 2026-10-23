import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, __setDbForTests } from '@/server/db/client';
import { createRepo, getRepo, __resetRepoForTests, type Repo } from '@/server/db/repo';
import { setRunner } from '@/server/orchestrator/runner';
import { bus } from '@/server/orchestrator/events';
import { POST } from '@/app/api/research/route';
import { GET as getTaskRoute } from '@/app/api/research/[id]/route';
import { GET as pollRoute } from '@/app/api/research/[id]/poll/route';

let repo: Repo;

beforeEach(() => {
  const db = openDb(':memory:');
  __setDbForTests(db);
  __resetRepoForTests();
  repo = createRepo(db);
});

function seedRunningTask(): void {
  repo.createTask({ id: 't_api', place_name: '云南省大理州云龙县诺邓村', place_json: '{"province":"云南省","city":"大理州","county":"云龙县","village":"诺邓村"}', lat: 25.88, lng: 99.15, direction: '综合沿革' });
  repo.updateTask('t_api', { status: 'searching' });
}

function useFakeRunner(): void {
  setRunner({
    async start() {
      seedRunningTask();
      setTimeout(() => {
        repo.updateTask('t_api', { status: 'completed', report_md: '# 报告' });
        bus.emit('t_api', 'content', { delta: '# 报告' });
        bus.emit('t_api', 'done', { taskId: 't_api', status: 'completed', elapsedMs: 5, sourcesKept: 2, scarcity: false, yuan: 0.1 });
      }, 10);
      return { taskId: 't_api', cached: false };
    },
  });
}

const body = { lat: 25.88, lng: 99.15, place: { province: '云南省', city: '大理州', county: '云龙县', village: '诺邓村' }, direction: '综合沿革' as const };

async function readSse(resp: Response): Promise<string[]> {
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1];
      if (ev) events.push(ev);
    }
  }
  return events;
}

async function readSseFull(resp: Response): Promise<Array<{ event: string; data: unknown }>> {
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events: Array<{ event: string; data: unknown }> = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1];
      const da = block.match(/^data: (.+)$/m)?.[1];
      if (ev) events.push({ event: ev, data: da ? JSON.parse(da) : null });
    }
  }
  return events;
}

describe('POST /api/research', () => {
  it('非法参数 → 400 invalid_params', async () => {
    const resp = await POST(new Request('http://x/api/research', { method: 'POST', body: JSON.stringify({ lat: 999, lng: 0, place: { province: 'a', county: 'b' }, direction: '综合沿革' }), headers: { 'content-type': 'application/json' } }));
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: { code: 'invalid_params' } });
  });
  it('正常创建 → SSE 依次 task_created/content/done,任务经 getRepo 落库', async () => {
    useFakeRunner();
    const resp = await POST(new Request('http://x/api/research', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
    expect(resp.headers.get('content-type')).toContain('text/event-stream');
    const events = await readSse(resp);
    expect(events[0]).toBe('task_created');
    expect(events).toContain('content');
    expect(events[events.length - 1]).toBe('done');
    expect(getRepo().getTask('t_api')!.status).toBe('completed');
  });
  it('缓存命中 → SSE 快路径 task_created(cached:true)/content/sources/done,流正常关闭', async () => {
    setRunner({
      async start() {
        seedRunningTask();
        repo.updateTask('t_api', { status: 'completed', report_md: '# 报告' });
        return { taskId: 't_api', cached: true };
      },
    });
    const resp = await POST(new Request('http://x/api/research', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
    const events = await readSseFull(resp);
    expect(events.map((e) => e.event)).toEqual(['task_created', 'content', 'sources', 'done']);
    expect(events[0].data).toMatchObject({ taskId: 't_api', cached: true });
    expect(events[1].data).toEqual({ delta: '# 报告' });
    expect(getRepo().getTask('t_api')!.status).toBe('completed');
  });
});

describe('GET /api/research/:id', () => {
  it('存在 → 200 全量(timeline/scarcity);不存在 → 404 not_found', async () => {
    seedRunningTask();
    const ok = await getTaskRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.task.id).toBe('t_api');
    expect(j.task.timeline).toEqual([]);
    expect(j.task.scarcity).toBe(false);
    const miss = await getTaskRoute(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(miss.status).toBe(404);
    expect(await miss.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('GET /api/research/:id/poll', () => {
  it('运行中 → done:false + continuePolling:true + intervalMs 3000', async () => {
    seedRunningTask();
    const rj = await (await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) })).json();
    expect(rj.done).toBe(false);
    expect(rj.continuePolling).toBe(true);
    expect(rj.intervalMs).toBe(3000);
    expect(rj.status).toBe('searching');
  });
  it('终态 → done:true + report 全量带回', async () => {
    seedRunningTask();
    repo.updateTask('t_api', { status: 'completed', report_md: '# 报告' });
    const rj = await (await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) })).json();
    expect(rj.done).toBe(true);
    expect(rj.continuePolling).toBe(false);
    expect(rj.report).toBe('# 报告');
  });
  it('不存在 → 404 not_found', async () => {
    const resp = await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(resp.status).toBe(404);
  });
});
