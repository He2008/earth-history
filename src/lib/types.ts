export const DIRECTIONS = [
  '综合沿革', '战争军事', '自然地理', '民族风俗',
  '历史人物', '古建筑文物', '经济商贸', '近现代变迁',
] as const;
export type Direction = (typeof DIRECTIONS)[number];
