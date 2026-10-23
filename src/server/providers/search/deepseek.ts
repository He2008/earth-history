import { normalizeUrl } from '@/lib/url-norm';
import { config } from '@/lib/config';
import type { SearchOpts, SearchProvider } from './types';

const DEEPSEEK_SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';

// DeepSeek Search API(2026):$0.75/千次,仅成功请求计费;results 自带 rerank_score/authority
export function createDeepSeekSearch(getKey: () => string = () => config.DEEPSEEK_API_KEY): SearchProvider {
  return {
    name: 'deepseek',
    async search(query, opts: SearchOpts) {
      const key = getKey();
      if (!key) throw new Error('deepseek: 缺少 API key');
      const f = opts.fetchImpl ?? fetch;
      const resp = await f(DEEPSEEK_SEARCH_URL, {
        method: 'POST',
        signal: AbortSignal.any([opts.signal ?? new AbortController().signal, AbortSignal.timeout(15_000)]),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, count: opts.count ?? 10 }),
      });
      if (!resp.ok) throw new Error(`deepseek: HTTP ${resp.status}`);
      const j = await resp.json();
      const list: any[] = j?.results ?? [];
      return list
        .filter((v) => String(v?.url ?? '').startsWith('http'))
        .map((v) => ({
          title: String(v?.title ?? ''),
          url: String(v?.url ?? ''),
          urlNorm: normalizeUrl(String(v?.url ?? '')),
          // summary(600-800 字,面向模型)信息量大于 snippet(面向 UI);落库口径仍截 200
          snippet: String(v?.summary ?? v?.snippet ?? '').slice(0, 200),
          publishedAt: v?.date ?? undefined,
          engine: 'deepseek' as const,
        }));
    },
  };
}
