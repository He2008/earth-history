import { SearchAllFailedError, type SearchEngine, type SearchHit, type SearchOpts, type SearchProvider } from './types';

export { SearchAllFailedError }; // brief 修复:测试从 chain 导入该错误类,需再导出

export interface SearchChain {
  search(query: string, opts: SearchOpts): Promise<{ hits: SearchHit[]; engine: SearchEngine }>;
}

export function createSearchChain(providers: SearchProvider[]): SearchChain {
  return {
    async search(query, opts) {
      const errs: string[] = [];
      for (const p of providers) {
        try {
          const hits = await p.search(query, opts);
          return { hits, engine: p.name };
        } catch (e) {
          errs.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      throw new SearchAllFailedError(errs.join(' | '));
    },
  };
}
