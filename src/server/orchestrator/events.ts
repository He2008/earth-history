export interface SseEvent { event: string; data: unknown }
type Listener = (e: SseEvent) => void;

export class TaskEventBus {
  private subs = new Map<string, Set<Listener>>();
  subscribe(taskId: string, fn: Listener): () => void {
    let set = this.subs.get(taskId);
    if (!set) { set = new Set(); this.subs.set(taskId, set); }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.subs.delete(taskId);
    };
  }
  emit(taskId: string, event: string, data: unknown): void {
    for (const fn of this.subs.get(taskId) ?? []) fn({ event, data });
  }
}

export const bus = new TaskEventBus();
