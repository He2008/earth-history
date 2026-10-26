import { describe, it, expect } from 'vitest';
import { cacheKey } from '@/lib/cache-key';

describe('cacheKey', () => {
  const base = cacheKey('云龙县', 25.881, 99.152, '综合沿革');
  it('同县同点同方向 → 相同 key', () => {
    expect(cacheKey('云龙县', 25.881, 99.152, '综合沿革')).toBe(base);
  });
  it('坐标第 3 位小数内抖动(≈1km)不影响', () => {
    expect(cacheKey('云龙县', 25.884, 99.149, '综合沿革')).toBe(base);
  });
  it('方向不同 → key 不同', () => {
    expect(cacheKey('云龙县', 25.881, 99.152, '战争军事')).not.toBe(base);
  });
  it('县名空白被归一化', () => {
    expect(cacheKey(' 云龙县 ', 25.881, 99.152, '综合沿革')).toBe(base);
  });
  it('不同县 → key 不同', () => {
    expect(cacheKey('临县', 25.881, 99.152, '综合沿革')).not.toBe(base);
  });
});
