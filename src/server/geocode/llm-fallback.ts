import type { LlmProvider } from '@/server/providers/llm/types';

// F8 境外/海域兜底:LLM 粗定位(M1-BACKLOG 定稿方案)
// 精度契约:国家级很准、一级行政区大致准——产出按「区域史」粒度消费,不做城市级断言
export interface LlmRegionResult {
  ocean: boolean;
  country: string | null;
  region: string | null;
  regionEn: string | null;
}

const PROMPT = (lat: number, lng: number) =>
  `坐标 (${lat.toFixed(3)}, ${lng.toFixed(3)})。判断该点位于哪个国家与一级行政区,或是否在海洋/大湖上。\n只输出 JSON,不要多余文字:{"ocean":bool,"country":"中文名或null","region":"一级行政区中文名或null","region_en":"一级行政区英文名或null"}`;

export async function llmLocate(llm: LlmProvider, lat: number, lng: number, signal?: AbortSignal): Promise<LlmRegionResult> {
  const call = llm.chatStream({
    messages: [
      { role: 'system', content: '你是地理粗定位器。根据经纬度判断所在国家与一级行政区;不确定时给出最可能的,海上给 ocean=true。' },
      { role: 'user', content: PROMPT(lat, lng) },
    ],
    temperature: 0,
    thinking: 'disabled',
    maxTokens: 200,
    signal,
  });
  let out = '';
  for await (const c of call.stream) out += c.delta ?? '';
  await call.usage.catch(() => {}); // 粗定位的 usage 不计研究成本
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 粗定位输出不可解析');
  const j = JSON.parse(m[0]) as Record<string, unknown>;
  return {
    ocean: Boolean(j.ocean),
    country: typeof j.country === 'string' && j.country !== 'null' ? j.country : null,
    region: typeof j.region === 'string' && j.region !== 'null' ? j.region : null,
    regionEn: typeof j.region_en === 'string' && j.region_en !== 'null' ? j.region_en : null,
  };
}
