// 研究客户端数据通道:SSE 主链 + 断线轮询接力(纯逻辑,不依赖 React)
import { applySseEvent, initialFeedState, parseSse, type ResearchFeedState, type FeedNote } from '@/lib/sse';
import type { Direction, PlaceInput } from '@/lib/types';

export interface TaskDetail {
  taskId: string;
  placeName: string;
  direction: string;
  status: string;
  reportMd: string;
  scarcity: boolean;
  shareToken: string | null;
  sources: { idx: number | null; title: string; url: string; url_norm: string; stage: string; published_at: string | null; quote: string | null }[];
  createdAt: number;
  timeline: FeedNote[];
  errorCode: string | null;
  errorMsg: string | null;
  yuan: number | null;
  totalMs: number | null;
  metrics: { sourcesKept: number; charsRead: number; minutesSaved: number } | null;
}

export async function fetchTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const resp = await fetch(`/api/research/${taskId}`);
  if (!resp.ok) return null;
  const j = await resp.json();
  const t = j.task;
  return {
    taskId: t.id,
    placeName: t.place_name,
    direction: t.direction,
    status: t.status,
    reportMd: t.report_md ?? '',
    scarcity: Boolean(t.scarcity),
    shareToken: t.share_token ?? null,
    sources: j.sources ?? [],
    createdAt: t.created_at,
    timeline: (t.timeline ?? []).map((e: { phase: string; note: string; round?: number; ts: number }) => e),
    errorCode: t.error_code ?? null,
    errorMsg: t.error_msg ?? null,
    yuan: (() => { try { const c = JSON.parse(t.cost_json ?? 'null'); return c?.yuan ?? null; } catch { return null; } })(),
    totalMs: (() => { try { const ti = JSON.parse(t.timings_json ?? 'null'); return ti?.totalMs ?? null; } catch { return null; } })(),
    metrics: (() => { try { const c = JSON.parse(t.cost_json ?? 'null'); return c?.metrics ?? null; } catch { return null; } })(),
  };
}

// POST /api/research 并消费 SSE 流;断流自动转 /poll 接力(TDD §5 双通道)
export async function streamResearch(
  input: { lat: number; lng: number; place: PlaceInput; direction: Direction; extra?: string },
  onUpdate: (s: ResearchFeedState) => void,
  onDetail: (d: TaskDetail) => void,
  signal?: AbortSignal,
): Promise<void> {
  let feed = initialFeedState();
  const update = (next: ResearchFeedState) => { feed = next; onUpdate(next); };
  let taskId: string | null = null;

  try {
    const resp = await fetch('/api/research', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    if (!resp.ok || !resp.body) {
      const j = await resp.json().catch(() => null);
      update(applySseEvent(feed, { event: 'error', data: j?.error ?? { code: 'internal', message: '创建任务失败' } }));
      return;
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { events, rest } = parseSse(buf);
      buf = rest;
      for (const ev of events) update(applySseEvent(feed, ev));
      if (feed.taskId) taskId = feed.taskId;
      if (feed.status === 'completed' || feed.status === 'scarce' || feed.status === 'failed') {
        if (feed.status !== 'failed' && taskId) await finalize(taskId, onDetail);
        return;
      }
    }
    // 流正常关闭但未到终态(代理截断等):转轮询
    if (taskId) await pollRelay(taskId, update, onDetail, signal);
  } catch (e) {
    if (signal?.aborted) return;
    // 网络错误:有 taskId 则轮询接力,否则报错
    if (taskId) { await pollRelay(taskId, update, onDetail, signal); return; }
    update(applySseEvent(feed, { event: 'error', data: { code: 'internal', message: (e as Error).message || '网络中断' } }));
  }
}

async function finalize(taskId: string, onDetail: (d: TaskDetail) => void): Promise<void> {
  const detail = await fetchTaskDetail(taskId);
  if (detail) onDetail(detail);
}

// /poll 快照 → 研究状态(timeline 只追加新增条目)
export async function pollRelay(
  taskId: string,
  onUpdate: (s: ResearchFeedState) => void,
  onDetail: (d: TaskDetail) => void,
  signal?: AbortSignal,
): Promise<void> {
  let feed = initialFeedState();
  feed.taskId = taskId;
  feed.status = 'running';
  feed.continuePolling = true;
  let seenTs = 0;
  for (;;) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 3000));
    let snap: Record<string, unknown>;
    try {
      const resp = await fetch(`/api/research/${taskId}/poll`, { signal });
      if (!resp.ok) throw new Error(String(resp.status));
      snap = await resp.json();
    } catch {
      continue; // 单次失败容忍,下轮重试
    }
    const timeline = (snap.timeline ?? []) as FeedNote[];
    for (const note of timeline) {
      if (note.ts > seenTs) { feed = applySseEvent(feed, { event: 'progress', data: note }); seenTs = note.ts; }
    }
    feed.phase = String(snap.status ?? feed.phase);
    feed.taskId = taskId;
    onUpdate({ ...feed });
    if (snap.done) {
      await finalize(taskId, onDetail);
      const status = String(snap.status);
      feed.status = status === 'scarce' ? 'scarce' : status === 'failed' ? 'failed' : 'completed';
      feed.scarcity = status === 'scarce';
      if (snap.error) feed.error = { code: String((snap.error as Record<string, string>).code ?? ''), message: String((snap.error as Record<string, string>).message ?? '') };
      onUpdate({ ...feed });
      return;
    }
  }
}
