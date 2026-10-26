import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest 与别名可用', async () => {
    const { DIRECTIONS } = await import('@/lib/types');
    expect(DIRECTIONS.length).toBe(8);
  });
});
