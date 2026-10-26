import { z } from 'zod';
import { DIRECTIONS } from '@/lib/types';
import { getRunner } from '@/server/orchestrator/runner';
import { getRepo } from '@/server/db/repo';
import { bus } from '@/server/orchestrator/events';
import { log } from '@/server/obs/log';

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  place: z.object({
    province: z.string().min(1),
    city: z.string().nullish(),
    county: z.string().min(1),
    village: z.string().nullish(),
  }),
  direction: z.enum(DIRECTIONS),
  extra: z.string().max(200).optional(),
});

const TERMINAL = new Set(['completed', 'scarce', 'failed']);

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { code: 'invalid_params', message: parsed.error.issues[0]?.message ?? '参数错误' } }, { status: 400 });
  }
  const repo = getRepo();
  let started: { taskId: string; cached: boolean };
  try {
    started = await getRunner().start(parsed.data as never);
  } catch (e) {
    return Response.json({ error: { code: 'internal', message: String(e) } }, { status: 500 });
  }
  const { taskId, cached } = started;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let hb: ReturnType<typeof setInterval> | undefined;
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const close = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      };
      const task = () => repo.getTask(taskId)!;
      send('task_created', { taskId, place: JSON.parse(task().place_json), cached });
      if (cached) {
        send('content', { delta: task().report_md });
        // 与 GET /:id、/:id/poll 同一过滤口径:kept|cited|fetched 均计为可用来源
        const srcs = repo.listSources(taskId).filter((s) => ['kept', 'cited', 'fetched'].includes(s.stage));
        send('sources', { items: srcs.map((s) => ({ idx: s.idx, title: s.title, url: s.url, site: '', date: s.published_at })) });
        send('done', { taskId, status: task().status, elapsedMs: 0, sourcesKept: srcs.length, scarcity: task().status === 'scarce', cached: true });
        close();
        return;
      }
      const unsub = bus.subscribe(taskId, (e) => {
        if (closed) return;
        send(e.event, e.data);
        if (e.event === 'done' || e.event === 'error') { unsub(); close(); }
      });
      hb = setInterval(() => { if (!closed) { try { controller.enqueue(enc.encode(': ping\n\n')); } catch { /* noop */ } } }, 15_000);
      req.signal.addEventListener('abort', () => { log.debug('sse.client_abort', { taskId }); unsub(); close(); });
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

export const runtime = 'nodejs';
