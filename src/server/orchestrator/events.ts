import { log } from '@/server/obs/log';

export interface SseEvent { event: string; data: unknown }
type Listener = (e: SseEvent) => void;

// D4 §3.1 白名单转发:SSE 事件同步落 stdout(content 等高频事件绝不进日志)
const FORWARD: Record<string, { level: 'info' | 'error'; event: string; shape: (d: Record<string, unknown>) => Record<string, unknown> }> = {
  progress: { level: 'info', event: 'phase', shape: (d) => ({ phase: d.phase, round: d.round, note: d.note }) },
  search_hit: { level: 'info', event: 'search.round', shape: (d) => ({ round: d.round, query: d.query, engine: d.engine, found: d.found }) },
  done: { level: 'info', event: 'task.done', shape: ({ taskId: _t, ...rest }) => rest },
  error: { level: 'error', event: 'task.fail', shape: (d) => ({ code: d.code, retryable: d.retryable, message: d.message }) },
};

export class TaskEventBus {
  private subs = new Map<string, Set<Listener>>();
  subscribe(taskId: string, fn: Listener): () => void {
    let set = this.subs.get(taskId);
    if (!set) { set = new Set<Listener>(); this.subs.set(taskId, set); }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.subs.delete(taskId);
    };
  }
  emit(taskId: string, event: string, data: unknown): void {
    const f = FORWARD[event];
    if (f && data && typeof data === 'object') log[f.level](f.event, { taskId, ...f.shape(data as Record<string, unknown>) });
    for (const fn of this.subs.get(taskId) ?? []) fn({ event, data });
  }
}

export const bus = new TaskEventBus();
