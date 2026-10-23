// POST SSE 的增量解析与研究视图状态机(纯函数,无 DOM,可在 node 测试)
export interface SseEvent { event: string; data: unknown }

export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  let i: number;
  while ((i = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // 心跳注释
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (event === null || !dataLines.length) continue;
    const raw = dataLines.join('\n');
    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch { /* 保留原文 */ }
    events.push({ event, data });
  }
  return { events, rest };
}

export interface FeedNote { phase: string; note: string; round?: number; ts: number }
export interface FeedHit { round: number; query: string; engine: string | null; found: number }
export interface FeedSource { idx: number | null; title: string; url: string; site?: string; date?: string | null }

export interface ResearchFeedState {
  taskId: string | null;
  cached: boolean;
  status: 'idle' | 'running' | 'completed' | 'scarce' | 'failed';
  phase: string;
  notes: FeedNote[];
  hits: FeedHit[];
  content: string;
  sources: FeedSource[] | null;
  scarcity: boolean;
  error: { code: string; message: string } | null;
  yuan: number | null;
  elapsedMs: number | null;
  continuePolling: boolean;
}

export function initialFeedState(): ResearchFeedState {
  return {
    taskId: null, cached: false, status: 'idle', phase: 'queued',
    notes: [], hits: [], content: '', sources: null,
    scarcity: false, error: null, yuan: null, elapsedMs: null, continuePolling: false,
  };
}

export function applySseEvent(state: ResearchFeedState, ev: SseEvent): ResearchFeedState {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  switch (ev.event) {
    case 'task_created':
      return { ...state, taskId: String(d.taskId ?? ''), cached: Boolean(d.cached), status: 'running' };
    case 'progress':
      return {
        ...state,
        phase: String(d.phase ?? state.phase),
        notes: [...state.notes, { phase: String(d.phase ?? ''), note: String(d.note ?? ''), round: d.round as number | undefined, ts: Number(d.ts ?? Date.now()) }],
      };
    case 'search_hit': {
      const round = Number(d.round ?? 0);
      const hit: FeedHit = { round, query: String(d.query ?? ''), engine: (d.engine as string | null) ?? null, found: Number(d.found ?? 0) };
      return {
        ...state,
        hits: [...state.hits, hit],
        notes: [...state.notes, { phase: 'searching', note: `第 ${round} 轮检索 · ${hit.query} · 新增 ${hit.found} 源`, round, ts: Date.now() }],
      };
    }
    case 'content':
      return { ...state, content: state.content + String(d.delta ?? '') };
    case 'sources':
      return { ...state, sources: (d.items as FeedSource[]) ?? [] };
    case 'done':
      return {
        ...state,
        status: d.status === 'scarce' ? 'scarce' : 'completed',
        scarcity: Boolean(d.scarcity),
        yuan: d.yuan === undefined ? null : Number(d.yuan),
        elapsedMs: d.elapsedMs === undefined ? null : Number(d.elapsedMs),
      };
    case 'error':
      return { ...state, status: 'failed', error: { code: String(d.code ?? 'internal'), message: String(d.message ?? '') } };
    case 'continue_polling':
      return { ...state, continuePolling: true };
    default:
      return state; // 未知事件向前兼容
  }
}
