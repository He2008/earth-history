import { describe, it, expect, vi } from 'vitest';
import { TaskEventBus } from '@/server/orchestrator/events';

describe('TaskEventBus', () => {
  it('emit 到订阅者,退订后不再收到', () => {
    const bus = new TaskEventBus();
    const fn = vi.fn();
    const off = bus.subscribe('t1', fn);
    bus.emit('t1', 'progress', { phase: 'planning' });
    off();
    bus.emit('t1', 'done', {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual({ event: 'progress', data: { phase: 'planning' } });
  });
  it('不同任务互不干扰', () => {
    const bus = new TaskEventBus();
    const fnA = vi.fn(), fnB = vi.fn();
    bus.subscribe('a', fnA); bus.subscribe('b', fnB);
    bus.emit('b', 'progress', 1);
    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalled();
  });
});
