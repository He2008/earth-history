import { getRepo } from '@/server/db/repo';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const repo = getRepo();
  const t = repo.getTask(id);
  if (!t) return Response.json({ error: { code: 'not_found', message: '任务不存在' } }, { status: 404 });
  const timeline = JSON.parse(t.timeline_json || '[]') as Array<{ round?: number }>;
  const done = ['completed', 'scarce', 'failed'].includes(t.status);
  const sources = repo.listSources(id).filter((s) => s.stage === 'kept' || s.stage === 'cited' || s.stage === 'fetched'); // 与 GET /:id 同口径
  const lastRound = [...timeline].reverse().find((e) => e.round != null)?.round ?? 0;
  return Response.json({
    taskId: id,
    status: t.status,
    round: lastRound,
    timeline,
    sourcesKept: sources.length,
    partialChars: (t.report_md ?? '').length,
    done,
    continuePolling: !done,
    intervalMs: 3000,
    report: done ? t.report_md : null,
    sources: done ? sources.map((s) => ({ idx: s.idx, title: s.title, url: s.url })) : null,
    error: t.status === 'failed' ? { code: t.error_code, message: t.error_msg } : null,
  });
}

export const runtime = 'nodejs';
