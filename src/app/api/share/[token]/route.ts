import { getRepo } from '@/server/db/repo';

// F7 公开只读分享:凭 share_token 取终稿报告;无效/未完成一律 404,不泄漏任务存在性
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const repo = getRepo();
  const t = repo.getTaskByShareToken(token);
  if (!t || !t.share_token) return Response.json({ error: { code: 'not_found', message: '链接无效' } }, { status: 404 });
  const sources = repo.listSources(t.id).filter((s) => s.stage === 'kept' || s.stage === 'cited' || s.stage === 'fetched');
  return Response.json({
    place: JSON.parse(t.place_json),
    direction: t.direction,
    report_md: t.report_md,
    sources: sources.map((s) => ({ idx: s.idx, title: s.title, url: s.url, published_at: s.published_at })),
    created_at: t.created_at,
    scarcity: t.status === 'scarce',
  });
}

export const runtime = 'nodejs';
