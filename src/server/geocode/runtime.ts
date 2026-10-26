import { config } from '@/lib/config';
import { createTiandituGeocoder, type Geocoder, type GeocodeResult } from './tianditu';
import { llmLocate } from './llm-fallback';
import { createLlmChain } from '@/server/providers/llm/chain';
import { createDeepSeek } from '@/server/providers/llm/deepseek';
import type { LlmProvider } from '@/server/providers/llm/types';

// 逆地理运行时:天地图(中国,POI 级)→ LLM 粗定位(境外/海域兜底,M1-BACKLOG 定稿)
// 测试钩子放这里,Next 路由文件只准导出处理器与配置
let _geocoder: Geocoder | null = null;
let _tdtPart: Geocoder | null = null;
let _llmPart: LlmProvider | null = null;
const defaultLlm = (): LlmProvider => createLlmChain([createDeepSeek()]);

export function __setGeocodeForTests(g: Geocoder | null): void { _geocoder = g; }
/** 替换降级链两环(天地图 / LLM),用于链路测试;null 还原 */
export function __setPartsForTests(tdt: Geocoder | null, llm: LlmProvider | null): void { _tdtPart = tdt; _llmPart = llm; }

async function geocodeWithFallback(lat: number, lng: number, signal?: AbortSignal): Promise<GeocodeResult> {
  const tdt = _tdtPart ?? createTiandituGeocoder(
    () => config.TIANDITU_KEY_SERVER,
    process.env.TIANDITU_ORIGIN ?? 'http://localhost:3000/',
  );
  try {
    return await tdt.geocode(lat, lng, signal);
  } catch {
    const r = await llmLocate(_llmPart ?? defaultLlm(), lat, lng, signal);
    if (r.ocean) throw new Error('海洋——这里的故事属于风与浪,换一个点吧');
    return {
      place: { province: r.country ?? '未知区域', city: null, county: r.region ?? r.country ?? '未知区域' },
      formatted: `${r.country ?? ''}${r.region ?? ''}`.replace(/undefined/g, '') || '未知区域',
      poi: r.region ? (r.regionEn ? `${r.region}(${r.regionEn})` : r.region) : r.country,
      source: 'llm-region',
    };
  }
}

export function getGeocode(): Geocoder {
  return _geocoder ??= { geocode: geocodeWithFallback };
}
