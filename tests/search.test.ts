import { describe, it, expect, vi } from 'vitest';
import { createBocha } from '@/server/providers/search/bocha';
import { createZhipu } from '@/server/providers/search/zhipu';
import { createSearchChain, SearchAllFailedError } from '@/server/providers/search/chain';
import type { SearchProvider } from '@/server/providers/search/types';

const jsonResp = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('bocha', () => {
  it('映射 webPages.value → SearchHit,snippet 截 200', async () => {
    const fetchMock = vi.fn(async () => jsonResp({ data: { webPages: { value: [
      { name: '云龙县志', url: 'https://dfz.yn.gov.cn/a?utm_source=x', summary: '长'.repeat(300), dateLastCrawled: '2024-01-01' },
    ] } } }));
    const hits = await createBocha(() => 'k').search('云龙县 历史', { fetchImpl: fetchMock as unknown as typeof fetch } as never);
    expect(hits[0].title).toBe('云龙县志');
    expect(hits[0].urlNorm).toBe('https://dfz.yn.gov.cn/a');
    expect(hits[0].snippet.length).toBe(200);
    expect(hits[0].engine).toBe('bocha');
  });
});

describe('zhipu', () => {
  it('映射 search_result,engine 正确', async () => {
    const fetchMock = vi.fn(async () => jsonResp({ search_result: [ { title: 't', link: 'https://z.com/1', content: 'c', publish_date: '2023-05-01' } ] }));
    const hits = await createZhipu('zhipu_sogou', () => 'k').search('q', { fetchImpl: fetchMock as unknown as typeof fetch } as never);
    expect(hits[0].url).toBe('https://z.com/1');
    expect(hits[0].engine).toBe('zhipu_sogou');
  });
});

describe('search chain', () => {
  const p = (name: any, impl: () => Promise<any[]>): SearchProvider => ({ name, search: impl });
  it('首家成功即返回(即使空结果)', async () => {
    const chain = createSearchChain([p('bocha', async () => [])]);
    const r = await chain.search('q', {});
    expect(r.hits).toEqual([]);
    expect(r.engine).toBe('bocha');
  });
  it('首家抛错 → 备选', async () => {
    const chain = createSearchChain([
      p('bocha', async () => { throw new Error('boom'); }),
      p('zhipu_std', async () => [{ title: 'a', url: 'https://a', urlNorm: 'https://a', snippet: '', engine: 'zhipu_std' }]),
    ]);
    const r = await chain.search('q', {});
    expect(r.engine).toBe('zhipu_std');
  });
  it('全抛错 → SearchAllFailedError', async () => {
    const chain = createSearchChain([p('bocha', async () => { throw new Error('x'); })]);
    await expect(chain.search('q', {})).rejects.toThrow(SearchAllFailedError);
  });
});
