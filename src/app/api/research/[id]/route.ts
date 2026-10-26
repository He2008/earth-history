import { getRepo } from '@/server/db/repo';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const repo = getRepo();
  const t = repo.getTask(id);
  if (!t) return Response.json({ error: { code: 'not_found', message: '任务不存在' } }, { status: 404 });
  const sources = repo.listSources(id).filter((s) => s.stage === 'kept' || s.stage === 'cited' || s.stage === 'fetched');
  return Response.json({
    task: {
      ...t,
      plan: t.plan_json ? JSON.parse(t.plan_json) : null,
      timeline: JSON.parse(t.timeline_json || '[]'),
      scarcity: t.status === 'scarce',
    },
    sources,
  });
}

export const runtime = 'nodejs';
