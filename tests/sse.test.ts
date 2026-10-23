import { describe, it, expect } from 'vitest';
import { parseSse, initialFeedState, applySseEvent } from '@/lib/sse';

describe('parseSse(POST SSE 增量解析)', () => {
  it('完整帧解析 event/data,注释心跳忽略', () => {
    const { events, rest } = parseSse('event: progress\ndata: {"phase":"planning"}\n\n: ping\n\nevent: content\ndata: {"delta":"好"}\n\n');
    expect(events).toEqual([
      { event: 'progress', data: { phase: 'planning' } },
      { event: 'content', data: { delta: '好' } },
    ]);
    expect(rest).toBe('');
  });
  it('半帧留在 rest 等待下一块', () => {
    const a = parseSse('event: content\ndata: {"delta":"半');
    expect(a.events).toEqual([]);
    const b = parseSse(a.rest + '"}\n\n');
    expect(b.events).toEqual([{ event: 'content', data: { delta: '半' } }]);
    expect(b.rest).toBe('');
  });
  it('非 JSON data 原样字符串', () => {
    const { events } = parseSse('event: x\ndata: plain\n\n');
    expect(events).toEqual([{ event: 'x', data: 'plain' }]);
  });
});

describe('applySseEvent(研究状态机)', () => {
  it('全事件序列:idle → running → done,内容与遥测齐备', () => {
    let s = initialFeedState();
    s = applySseEvent(s, { event: 'task_created', data: { taskId: 't1', cached: false } });
    expect(s.status).toBe('running');
    expect(s.taskId).toBe('t1');
    s = applySseEvent(s, { event: 'progress', data: { phase: 'searching', round: 1, note: '开始自适应检索', ts: 1 } });
    expect(s.phase).toBe('searching');
    expect(s.notes.at(-1)).toMatchObject({ phase: 'searching', note: '开始自适应检索' });
    s = applySseEvent(s, { event: 'search_hit', data: { round: 1, query: '云龙县 沿革', engine: 'bocha', found: 5, kept: [{ title: '县志', url: 'https://a/1', snippet: 's' }] } });
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]).toMatchObject({ round: 1, query: '云龙县 沿革', found: 5, engine: 'bocha' });
    expect(s.notes.some((n) => n.note.includes('检索'))).toBe(true);
    s = applySseEvent(s, { event: 'content', data: { delta: '第一段' } });
    s = applySseEvent(s, { event: 'content', data: { delta: '第二段' } });
    expect(s.content).toBe('第一段第二段');
    s = applySseEvent(s, { event: 'sources', data: { items: [{ idx: 1, title: '县志', url: 'https://a/1' }] } });
    expect(s.sources).toEqual([{ idx: 1, title: '县志', url: 'https://a/1' }]);
    s = applySseEvent(s, { event: 'done', data: { taskId: 't1', status: 'scarce', elapsedMs: 9000, sourcesKept: 2, scarcity: true, yuan: 0.12 } });
    expect(s.status).toBe('scarce');
    expect(s.scarcity).toBe(true);
    expect(s.yuan).toBe(0.12);
    expect(s.elapsedMs).toBe(9000);
  });
  it('error 事件 → failed 且带错误码', () => {
    let s = applySseEvent(initialFeedState(), { event: 'task_created', data: { taskId: 't2', cached: false } });
    s = applySseEvent(s, { event: 'error', data: { code: 'llm_all_failed', message: '全部失败', retryable: true } });
    expect(s.status).toBe('failed');
    expect(s.error).toEqual({ code: 'llm_all_failed', message: '全部失败' });
  });
  it('缓存命中:task_created(cached) + content + done 同样收敛到终态', () => {
    let s = initialFeedState();
    s = applySseEvent(s, { event: 'task_created', data: { taskId: 't3', cached: true } });
    expect(s.cached).toBe(true);
    s = applySseEvent(s, { event: 'content', data: { delta: '# 报告' } });
    s = applySseEvent(s, { event: 'done', data: { taskId: 't3', status: 'completed', elapsedMs: 0, sourcesKept: 3, scarcity: false, cached: true } });
    expect(s.status).toBe('completed');
    expect(s.content).toBe('# 报告');
  });
  it('continue_polling → 置轮询标志', () => {
    let s = applySseEvent(initialFeedState(), { event: 'continue_polling', data: { taskId: 't4', intervalMs: 3000 } });
    expect(s.continuePolling).toBe(true);
  });
  it('未知事件不改状态(向前兼容)', () => {
    const s0 = initialFeedState();
    const s1 = applySseEvent(s0, { event: 'future_thing', data: {} });
    expect(s1).toEqual(s0);
  });
});
