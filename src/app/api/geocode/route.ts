import { z } from 'zod';
import { getGeocode } from '@/server/geocode/runtime';

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// F2 逆地理编码:点击坐标 → 中文地名(省/市/县 + POI 展示)
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ lat: url.searchParams.get('lat'), lng: url.searchParams.get('lng') });
  if (!parsed.success) {
    return Response.json({ error: { code: 'invalid_params', message: parsed.error.issues[0]?.message ?? '参数错误' } }, { status: 400 });
  }
  try {
    const r = await getGeocode().geocode(parsed.data.lat, parsed.data.lng, req.signal);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: { code: 'geocode_failed', message: (e as Error).message } }, { status: 502 });
  }
}

export const runtime = 'nodejs';
