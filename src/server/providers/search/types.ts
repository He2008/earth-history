export type SearchEngine = 'bocha' | 'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou';
export interface SearchHit {
  title: string; url: string; urlNorm: string;
  snippet: string; publishedAt?: string; engine: SearchEngine;
}
export interface SearchOpts { count?: number; signal?: AbortSignal; fetchImpl?: typeof fetch }
export interface SearchProvider {
  readonly name: SearchEngine;
  search(query: string, opts: SearchOpts): Promise<SearchHit[]>;
}
export class SearchAllFailedError extends Error {
  constructor(detail: string) { super(`搜索全部失败: ${detail}`); }
}
