import type { SearchEngine } from '@/server/providers/search/types';

// 元/次;LLM 元/token。以各家控制台当前价为准,M0 实测时复核
// deepseek 搜索:$0.75/千次(仅成功计费)≈ ¥0.0053/次
export const SEARCH_PRICES: Record<SearchEngine, number> = {
  deepseek: 0.0053,
  bocha: 0.036, zhipu_std: 0.01, zhipu_pro: 0.03, zhipu_sogou: 0.05,
};
export const LLM_PRICES = {
  deepseek: { in: 2e-6, out: 8e-6 },
  qwen: { in: 8e-7, out: 2e-6 },
};
