import { normalizeUrl } from '@/lib/url-norm';
import type { SearchHit, SearchOpts, SearchProvider } from './types';

const BOCHA_URL = 'https://api.bochaai.com/v1/web-search';

export function createBocha(getKey: () => string): SearchProvider {
  return {
    name: 'bocha',
    async search(query, opts: SearchOpts) {
      const key = getKey();
      if (!key) throw new Error('bocha: 缺少 API key');
      const f = opts.fetchImpl ?? fetch;
      const resp = await f(BOCHA_URL, {
        method: 'POST',
        signal: AbortSignal.any([opts.signal ?? new AbortController().signal, AbortSignal.timeout(15_000)]),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, count: opts.count ?? 10, freshness: 'noLimit', summary: true, page: 1 }),
      });
      if (!resp.ok) throw new Error(`bocha: HTTP ${resp.status}`);
      const j = await resp.json();
      const values: any[] = j?.data?.webPages?.value ?? [];
      return values
        .filter((v) => String(v?.url ?? '').startsWith('http'))
        .map((v) => ({
          title: String(v?.name ?? v?.title ?? ''),
          url: String(v?.url ?? ''),
          urlNorm: normalizeUrl(String(v?.url ?? '')),
          snippet: String(v?.summary ?? v?.snippet ?? '').slice(0, 200),
          publishedAt: v?.dateLastCrawled ?? v?.publishDate ?? undefined,
          engine: 'bocha' as const,
        }));
    },
  };
}
