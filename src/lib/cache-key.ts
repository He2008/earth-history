import { createHash } from 'node:crypto';

export function cacheKey(county: string, lat: number, lng: number, direction: string): string {
  const name = county.trim().replace(/\s+/g, '');
  const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return createHash('sha256').update(`${name}|${r2(lat)}|${r2(lng)}|${direction}`).digest('hex');
}
