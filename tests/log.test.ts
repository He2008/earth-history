import { describe, it, expect } from 'vitest';
import { log, __captureLogsForTests } from '@/server/obs/log';
import { TaskEventBus } from '@/server/orchestrator/events';

describe('log(D4 约定)', () => {
  it('info 级别下 debug 被过滤,warn/error 通过', () => {
    const cap = __captureLogsForTests('info');
    try {
      log.debug('fetch.start', { taskId: 't', idx: 1, urlNorm: 'https://a/1' });
      log.info('task.start', { taskId: 't', place: '云南省云龙县', direction: '综合沿革' });
      log.warn('search.degrade', { engine: 'bocha', err: 'down' });
      log.error('search.all_failed', { tried: ['bocha: down'] });
    } finally { cap.restore(); }
    expect(cap.lines.map((l) => l.event)).toEqual(['task.start', 'search.degrade', 'search.all_failed']);
  });

  it('每行含 ts/level/event 信封字段', () => {
    const cap = __captureLogsForTests('debug');
    try { log.warn('circuit.open', { provider: 'deepseek', retryAt: 123 }); } finally { cap.restore(); }
    const l = cap.lines[0] as Record<string, unknown>;
    expect(typeof l.ts).toBe('number');
    expect(l.level).toBe('warn');
    expect(l.event).toBe('circuit.open');
    expect(l.provider).toBe('deepseek');
  });
});

describe('bus 白名单转发(D4 §3.1)', () => {
  it('done → task.done 且透传 reportChars;content 永不落日志', () => {
    const bus = new TaskEventBus();
    const cap = __captureLogsForTests('debug');
    try {
      bus.emit('t1', 'done', { taskId: 't1', status: 'completed', elapsedMs: 100, sourcesKept: 12, scarcity: false, yuan: 0.1, reportChars: 3690 });
      bus.emit('t1', 'content', { delta: '正文片段' });
      bus.emit('t1', 'error', { code: 'timeout', message: 'x', retryable: true });
    } finally { cap.restore(); }
    expect(cap.lines.map((l) => l.event)).toEqual(['task.done', 'task.fail']);
    const done = cap.lines[0] as Record<string, unknown>;
    expect(done.taskId).toBe('t1');
    expect(done.reportChars).toBe(3690);
    expect('taskId' in (done as object) && done.status).toBe('completed');
  });

  it('progress/search_hit 整形为 phase/search.round', () => {
    const bus = new TaskEventBus();
    const cap = __captureLogsForTests('debug');
    try {
      bus.emit('t1', 'progress', { phase: 'searching', round: 2, note: '第 2 轮检索', ts: 1 });
      bus.emit('t1', 'search_hit', { round: 1, query: '云龙县 历史', engine: 'deepseek', found: 29, kept: [{ title: 'x' }] });
    } finally { cap.restore(); }
    const [phase, round] = cap.lines as Array<Record<string, unknown>>;
    expect(phase.event).toBe('phase');
    expect(phase.phase).toBe('searching');
    expect(round.event).toBe('search.round');
    expect(round.found).toBe(29);
    expect('kept' in (round as object)).toBe(false); // 明细不进日志
  });
});
