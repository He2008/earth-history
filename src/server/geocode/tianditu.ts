// F2 逆地理编码:天地图 geocoder,稳定到区县(PRD F2);POI/乡镇作展示名
// 注意:浏览器端类型的 key 要求浏览器特征头(UA + Referer),服务端调用需一并携带;
// 将来换服务端 key 时去掉 headers 亦可,本适配器只从 env 取 key,不改代码。
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface GeocodeResult {
  place: { province: string; city: string | null; county: string };
  formatted: string;
  poi: string | null;
  source: 'tianditu' | 'llm-region';
}

export interface Geocoder {
  geocode(lat: number, lng: number, signal?: AbortSignal): Promise<GeocodeResult>;
}

interface TdtResponse {
  result?: {
    formatted_address?: string;
    addressComponent?: { province?: string; city?: string; county?: string; town?: string; address?: string };
  };
}

export function createTiandituGeocoder(getKey: () => string, origin: string, fetchFn: typeof fetch = fetch): Geocoder {
  return {
    async geocode(lat: number, lng: number, signal?: AbortSignal): Promise<GeocodeResult> {
      const key = getKey();
      if (!key) throw new Error('tianditu key missing');
      const postStr = JSON.stringify({ lon: lng, lat, ver: 1 });
      const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${key}`;
      let resp: Response;
      try {
        resp = await fetchFn(url, { signal, headers: { Referer: origin, 'User-Agent': BROWSER_UA } });
      } catch (e) {
        throw new Error(`天地图网络错误: ${(e as Error).message}`);
      }
      if (!resp.ok) throw new Error(`天地图 HTTP ${resp.status}`);
      const body = (await resp.json()) as TdtResponse;
      const c = body.result?.addressComponent ?? {};
      if (!c.province || !c.county) throw new Error('该点无政区信息(海域或境外)');
      return {
        place: { province: c.province, city: c.city || null, county: c.county },
        formatted: body.result?.formatted_address ?? `${c.province}${c.city ?? ''}${c.county}`,
        poi: c.address || c.town || null,
        source: 'tianditu',
      };
    },
  };
}
