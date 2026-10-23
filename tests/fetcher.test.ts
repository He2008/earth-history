import { describe, it, expect } from 'vitest';
import { htmlToText } from '@/server/providers/fetch/readability';
import { createFetcher, RobotsGuard } from '@/server/providers/fetch/fetcher';

describe('htmlToText', () => {
  it('去 script/style、标签转行、实体解码、截 8000', () => {
    const html = `<html><head><title>云龙县志</title><script>var x=1;</script><style>.a{}</style></head>
      <body><h1>建制沿革</h1><p>汉武帝&nbsp;置比苏县&amp;县治所在</p><script>bad()</script></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('云龙县志');
    expect(text).toContain('建制沿革');
    expect(text).toContain('汉武帝 置比苏县&县治所在');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('bad(');
    expect(text.length).toBeLessThanOrEqual(8000);
  });
});

describe('RobotsGuard + fetcher', () => {
  it('robots 禁止 → ok:false reason:robots,不发页面请求', async () => {
    const pageFetch = vi.fn();
    const robotsFetch = vi.fn(async () => new Response('User-agent: *\nDisallow: /private/', { status: 200 }));
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt') ? robotsFetch() : pageFetch());
    const guard = new RobotsGuard(fetchImpl as any);
    const fetcher = createFetcher(guard, fetchImpl as any);
    const page = await fetcher.fetch('https://x.com/private/a.html');
    expect(page.ok).toBe(false);
    expect(page.reason).toBe('robots');
    expect(pageFetch).not.toHaveBeenCalled();
  });
  it('连续 UA 行合并分组:* 在前不丢 Disallow 规则', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: *\nUser-agent: GPTBot\nDisallow: /private/', { status: 200 }));
    const guard = new RobotsGuard(fetchImpl as any);
    expect(await guard.allowed('https://a.com/private/x')).toBe(false);
    expect(await guard.allowed('https://a.com/public/x')).toBe(true);
  });
  it('连续 UA 行合并分组:* 在后同样生效', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: GPTBot\nUser-agent: *\nDisallow: /x', { status: 200 }));
    const guard = new RobotsGuard(fetchImpl as any);
    expect(await guard.allowed('https://b.com/x/y')).toBe(false);
  });
  it('正常抓取 → 提取正文', async () => {
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response('<html><head><title>T</title></head><body><p>正文段落</p></body></html>', { headers: { 'content-type': 'text/html' } }));
    const guard = new RobotsGuard(fetchImpl as any);
    const fetcher = createFetcher(guard, fetchImpl as any);
    const page = await fetcher.fetch('https://y.com/doc');
    expect(page.ok).toBe(true);
    expect(page.text).toContain('正文段落');
    expect(page.title).toBe('T');
  });
  it('非 html → ok:false reason:not_html', async () => {
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const fetcher = createFetcher(new RobotsGuard(fetchImpl as any), fetchImpl as any);
    expect((await fetcher.fetch('https://z.com/api')).reason).toBe('not_html');
  });
});

import { vi } from 'vitest';
