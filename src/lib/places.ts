import raw from '@/data/seed-places.json';
import type { PlaceInput } from '@/lib/types';

// F8 种子地点池:全国重点文保/世界遗产级精选(PRD:种子 ~100 处,M1 期间扩 500+)
// 坐标为地点级近似(研究由地名驱动,坐标用于缓存键与后续地球落点)
export interface SeedPlace {
  name: string; province: string; city: string | null; county: string;
  lat: number; lng: number;
}

export const SEED_PLACES = raw as SeedPlace[];

export function searchPlaces(query: string, limit = 8): SeedPlace[] {
  const q = query.trim();
  if (!q) return [];
  return SEED_PLACES
    .filter((p) => p.name.includes(q) || p.county.includes(q) || p.province.includes(q) || (p.city ?? '').includes(q))
    .slice(0, limit);
}

export function pickRandomPlace(): SeedPlace {
  return SEED_PLACES[Math.floor(Math.random() * SEED_PLACES.length)]!;
}

// 池条目 → 研究输入的地点结构:名称作为最末一级(村/点)
export function placeInputOf(p: SeedPlace): PlaceInput {
  return { province: p.province, city: p.city, county: p.county, village: p.name };
}

export function seedPlaceDisplayName(p: SeedPlace): string {
  return `${p.province}${p.city ?? ''}${p.county}${p.name}`;
}
