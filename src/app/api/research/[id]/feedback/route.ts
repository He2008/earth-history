import { z } from 'zod';
import { getRepo } from '@/server/db/repo';

const BodySchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

// 满意度 👍/👎:只有 1/-1 两个合法值,落 feedback 列
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { code: 'invalid_params', message: 'value 只允许 1 或 -1' } }, { status: 400 });
  }
  const repo = getRepo();
  if (!repo.getTask(id)) return Response.json({ error: { code: 'not_found', message: '任务不存在' } }, { status: 404 });
  repo.updateTask(id, { feedback: parsed.data.value });
  return Response.json({ ok: true });
}

export const runtime = 'nodejs';
