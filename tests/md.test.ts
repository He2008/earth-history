import { describe, it, expect } from 'vitest';
import { renderReport } from '@/lib/md';

describe('renderReport(受控 markdown 子集渲染)', () => {
  it('标题/段落/加粗/引用', () => {
    const html = renderReport('## 建制沿革\n\n诺邓**因盐而兴**。\n\n> ⚠️ 公开资料稀缺\n');
    expect(html).toContain('<h2>建制沿革</h2>');
    expect(html).toContain('<p>诺邓<strong>因盐而兴</strong>。</p>');
    expect(html).toContain('<blockquote>⚠️ 公开资料稀缺</blockquote>');
  });
  it('链接渲染为受控 a 标签(仅 http/https)', () => {
    const html = renderReport('[县志](https://a/1)');
    expect(html).toContain('<a href="https://a/1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(renderReport('[x](javascript:alert(1))')).not.toContain('href="javascript');
  });
  it('引用编号 [n] 渲染为上标', () => {
    const html = renderReport('秦置[1],唐置[2]。');
    expect(html).toContain('<sup class="cite" data-idx="1">[1]</sup>');
    expect(html).toContain('<sup class="cite" data-idx="2">[2]</sup>');
  });
  it('HTML 转义防注入(LLM 输出不可信)', () => {
    const html = renderReport('<script>alert(1)</script> & <img src=x onerror=1>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
  it('来源列表渲染为有序列表(保留原始编号)', () => {
    const html = renderReport('## 来源\n1. [县志](https://a/1)\n2. [府志](https://b/2)\n');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li value="1">');
    expect(html).toContain('href="https://a/1"');
  });
  it('markdown 链接不吃引用编号语义:[文本](url) 与独立 [3] 共存', () => {
    const html = renderReport('参考[1],详见[云龙县志](https://a/1)。');
    expect(html).toContain('<sup class="cite" data-idx="1">[1]</sup>');
    expect(html).toContain('<a href="https://a/1"');
  });
});
