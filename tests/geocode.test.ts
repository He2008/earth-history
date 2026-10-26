import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTiandituGeocoder } from '@/server/geocode/tianditu';
import { GET } from '@/app/api/geocode/route';
import { __setGeocodeForTests, __setPartsForTests } from '@/server/geocode/runtime';
import type { LlmProvider } from '@/server/providers/llm/types';

const okBody = {
  result: {
    formatted_address: '云南省大理白族自治州云龙县苗尾傈僳族乡',
    addressComponent: { province: '云南省', city: '大理白族自治州', county: '云龙县', town: '苗尾傈僳族乡', address: '苗尾温泉' },
  },
};

afterEach(() => { __setGeocodeForTests(null); __setPartsForTests(null, null); });

describe('天地图逆地理适配器', () => {
  it('成功:解析省/市/县与 POI,请求带浏览器 UA + Referer(浏览器端 key 准入条件)', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(okBody), { status: 200 }));
    const g = createTiandituGeocoder(() => 'k', 'http://localhost:3000/', fetchFn as unknown as typeof fetch);
    const r = await g.geocode(25.88, 99.15);
    expect(r.place).toEqual({ province: '云南省', city: '大理白族自治州', county: '云龙县' });
    expect(r.formatted).toContain('云龙县');
    expect(r.poi).toBe('苗尾温泉');
    expect(r.source).toBe('tianditu');
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('type=geocode');
    expect(String(url)).toContain('lon%22%3A99.15');
    expect(String(url)).toContain('tk=k');
    const headers = init.headers as Record<string, string>;
    expect(headers.Referer).toBe('http://localhost:3000/');
    expect(headers['User-Agent']).toMatch(/Mozilla/);
  });
  it('非 200 → 抛错(路由归 geocode_failed)', async () => {
    const fetchFn = vi.fn(async () => new Response('{"msg":"权限类型错误"}', { status: 403 }));
    const g = createTiandituGeocoder(() => 'k', 'http://x/', fetchFn as unknown as typeof fetch);
    await expect(g.geocode(1, 1)).rejects.toThrow();
  });
  it('缺省/县(海洋、境外或空 result)→ 抛错', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ result: { formatted_address: '', addressComponent: {} } }), { status: 200 }));
    const g = createTiandituGeocoder(() => 'k', 'http://x/', fetchFn as unknown as typeof fetch);
    await expect(g.geocode(0, 0)).rejects.toThrow(/政区/);
  });
  it('空 key 直接抛错,不发请求', async () => {
    const fetchFn = vi.fn();
    const g = createTiandituGeocoder(() => '', 'http://x/', fetchFn as unknown as typeof fetch);
    await expect(g.geocode(1, 1)).rejects.toThrow(/key/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('GET /api/geocode', () => {
  it('参数越界 → 400 invalid_params', async () => {
    const resp = await GET(new Request('http://x/api/geocode?lat=999&lng=0'));
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: { code: 'invalid_params' } });
  });
  it('成功 → place/formatted/poi/source', async () => {
    __setGeocodeForTests({
      async geocode() {
        return { place: { province: '云南省', city: '大理白族自治州', county: '云龙县' }, formatted: '云南省…云龙县', poi: '苗尾温泉', source: 'tianditu' };
      },
    });
    const resp = await GET(new Request('http://x/api/geocode?lat=25.88&lng=99.15'));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ place: { county: '云龙县' }, source: 'tianditu' });
  });
  it('适配器失败 → 502 geocode_failed', async () => {
    __setGeocodeForTests({ async geocode() { throw new Error('天地图: 403'); } });
    const resp = await GET(new Request('http://x/api/geocode?lat=1&lng=1'));
    expect(resp.status).toBe(502);
    expect(await resp.json()).toMatchObject({ error: { code: 'geocode_failed' } });
  });
});

describe('降级链(F8 境外兜底):天地图失败 → LLM 粗定位', () => {
  const fakeRegionLlm = (json: string): LlmProvider => ({
    name: 'deepseek',
    chatStream: () => ({
      usage: Promise.resolve({ promptTokens: 50, completionTokens: 30 }),
      stream: (async function* () { yield { delta: json }; })(),
    }),
  });
  it('境外陆地 → llm-region 载荷,POI 带英文名(双语检索词)', async () => {
    __setPartsForTests(
      { async geocode() { throw new Error('该点无政区信息(海域或境外)'); } },
      fakeRegionLlm('{"ocean":false,"country":"美国","region":"堪萨斯州","region_en":"Kansas"}'),
    );
    const resp = await GET(new Request('http://x/api/geocode?lat=38.5&lng=-98.5'));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ place: { province: '美国', county: '堪萨斯州' }, poi: '堪萨斯州(Kansas)', source: 'llm-region' });
  });
  it('海洋 → 502 geocode_failed,消息可读', async () => {
    __setPartsForTests(
      { async geocode() { throw new Error('x'); } },
      fakeRegionLlm('{"ocean":true,"country":null,"region":null,"region_en":null}'),
    );
    const resp = await GET(new Request('http://x/api/geocode?lat=0&lng=-140'));
    expect(resp.status).toBe(502);
    const j = await resp.json();
    expect(j.error.code).toBe('geocode_failed');
    expect(j.error.message).toContain('海洋');
  });
});
