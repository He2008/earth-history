import { describe, it, expect } from 'vitest';
import { SEED_PLACES, searchPlaces, pickRandomPlace, placeInputOf, seedPlaceDisplayName } from '@/lib/places';

describe('种子地点池(F8)', () => {
  it('规模 ≥ 100(PRD 种子池要求)', () => {
    expect(SEED_PLACES.length).toBeGreaterThanOrEqual(100);
  });
  it('每条字段完整且坐标落在中国范围', () => {
    for (const p of SEED_PLACES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.province.length).toBeGreaterThan(0);
      expect(p.county.length).toBeGreaterThan(0);
      expect(p.lat).toBeGreaterThanOrEqual(18);
      expect(p.lat).toBeLessThanOrEqual(54);
      expect(p.lng).toBeGreaterThanOrEqual(73);
      expect(p.lng).toBeLessThanOrEqual(136);
    }
  });
  it('名称不重复(随机探索不撞车)', () => {
    expect(new Set(SEED_PLACES.map((p) => seedPlaceDisplayName(p))).size).toBe(SEED_PLACES.length);
  });
});

describe('searchPlaces', () => {
  it('按名称/县/省匹配,空串返回空', () => {
    expect(searchPlaces('')).toEqual([]);
    const hits = searchPlaces('敦煌');
    expect(hits.map((p) => p.name)).toContain('莫高窟');
    expect(hits.map((p) => p.name)).toContain('玉门关遗址');
    expect(searchPlaces('云冈')[0]!.name).toBe('云冈石窟');
    expect(searchPlaces('山西省')[0]!.province).toBe('山西省');
  });
  it('limit 生效', () => {
    expect(searchPlaces('遗址', 3)).toHaveLength(3);
  });
});

describe('pickRandomPlace / placeInputOf', () => {
  it('随机结果在池内,多次抽样有分布', () => {
    const names = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const p = pickRandomPlace();
      expect(SEED_PLACES).toContain(p);
      names.add(p.name);
    }
    expect(names.size).toBeGreaterThan(1);
  });
  it('placeInputOf 名称作最末一级,display 拼接正确', () => {
    const p = SEED_PLACES.find((x) => x.name === '诺邓古村')!;
    const input = placeInputOf(p);
    expect(input).toEqual({ province: '云南省', city: '大理州', county: '云龙县', village: '诺邓古村' });
    expect(seedPlaceDisplayName(p)).toBe('云南省大理州云龙县诺邓古村');
  });
});
