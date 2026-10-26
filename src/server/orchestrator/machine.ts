export const TERMINAL_STATUSES = ['completed', 'scarce', 'failed'] as const;

const GRAPH: Record<string, readonly string[]> = {
  queued: ['planning', 'failed'],
  planning: ['searching', 'failed'],
  searching: ['fetching', 'scarce', 'failed'],
  fetching: ['synthesizing', 'scarce', 'failed'],
  synthesizing: ['completed', 'failed'],
  completed: [], scarce: [], failed: [],
};

export function canTransition(from: string, to: string): boolean {
  return (GRAPH[from] ?? []).includes(to);
}

export const BUDGETS_MS = {
  planning: 60_000,
  searchQuery: 15_000,
  searchRound: 45_000,
  searchTotal: 150_000,
  fetchUrl: 15_000,
  fetchTotal: 60_000,
  synthesize: 180_000,
  scarce: 90_000,
  taskHard: 600_000,
} as const;

export class TaskRegistry {
  private handles = new Map<string, AbortController>();
  register(id: string): AbortController {
    const c = new AbortController();
    this.handles.set(id, c);
    return c;
  }
  release(id: string): void { this.handles.delete(id); }
  abort(id: string): void { this.handles.get(id)?.abort(); }
  abortAll(): void {
    for (const c of this.handles.values()) c.abort();
    this.handles.clear();
  }
  get size(): number { return this.handles.size; }
}

export const registry = new TaskRegistry();
