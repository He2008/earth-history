import { normalizeUrl } from '@/lib/url-norm';
import type { SearchEngine, SearchHit, SearchOpts, SearchProvider } from './types';

const ZHIPU_TOOLS_URL = 'https://open.bigmodel.cn/api/paas/v4/tools';
const ENGINE_PARAM: Record<'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou', string> = {
  zhipu_std: 'search_std', zhipu_pro: 'search_pro', zhipu_sogou: 'search_pro_sogou',
};

export function createZhipu(engine: 'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou', getKey: () => string): SearchProvider {
  return {
    name: engine,
    async search(query, opts: SearchOpts) {
      const key = getKey();
      if (!key) throw new Error(`${engine}: 缺少 API key`);
      const f = opts.fetchImpl ?? fetch;
      const resp = await f(ZHIPU_TOOLS_URL, {
        method: 'POST',
        signal: opts.signal ?? AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          tool: 'web_search',
          messages: [{ role: 'user', content: query }],
          search_engine: ENGINE_PARAM[engine],
          count: opts.count ?? 10,
        }),
      });
      if (!resp.ok) throw new Error(`${engine}: HTTP ${resp.status}`);
      const j = await resp.json();
      const list: any[] = j?.search_result ?? j?.data?.search_result ?? [];
      return list
        .map((v) => ({
          title: String(v?.title ?? ''),
          url: String(v?.link ?? v?.url ?? ''),
          urlNorm: normalizeUrl(String(v?.link ?? v?.url ?? '')),
          snippet: String(v?.content ?? '').slice(0, 200),
          publishedAt: v?.publish_date ?? v?.date_published ?? undefined,
          engine: engine as SearchEngine,
        }))
        .filter((h) => h.url.startsWith('http'));
    },
  };
}
