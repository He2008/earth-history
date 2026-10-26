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
    expect(html).toContain('<sup class="cite" data-idx="1" id="cite-1">[1]</sup>');
    expect(html).toContain('<sup class="cite" data-idx="2" id="cite-2">[2]</sup>');
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
    expect(html).toContain('<li value="1" class="ref-item">');
    expect(html).toContain('href="https://a/1"');
  });
  it('markdown 链接不吃引用编号语义:[文本](url) 与独立 [3] 共存', () => {
    const html = renderReport('参考[1],详见[云龙县志](https://a/1)。');
    expect(html).toContain('<sup class="cite" data-idx="1" id="cite-1">[1]</sup>');
    expect(html).toContain('<a href="https://a/1"');
  });
});

describe('来源列表(百度百科参考资料风格)', () => {
  const md = '正文引一[1]。\n\n## 来源\n1. [县志](https://dfz.yn.gov.cn/a) ．dfz.yn.gov.cn [2024-01-01]\n2. [无日期源](https://b.com/x) ．b.com\n';
  it('渲染 ref-item:序号徽标、favicon、外链图标、站点名、日期', () => {
    const html = renderReport(md);
    expect(html).toContain('<li value="1" class="ref-item">');
    expect(html).toContain('class="ref-index">1</span>');
    expect(html).toContain('icons.duckduckgo.com/ip3/dfz.yn.gov.cn.ico');
    expect(html).toContain('class="ref-site">．dfz.yn.gov.cn</span>');
    expect(html).toContain('class="ref-date">[2024-01-01]</span>');
    expect(html).toContain('<svg class="ref-ext"');
  });
  it('无日期不带日期 span;未被正文引用的来源没有回跳箭头,被引的有 #cite-n', () => {
    const html = renderReport(md);
    expect(html).toContain('class="ref-site">．b.com</span>');
    expect((html.match(/class="ref-date"/g) ?? []).length).toBe(1);
    expect((html.match(/class="ref-gotop"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="#cite-1"');
  });
  it('正文引用上标首现带锚点 id,复现不重复;被引来源有回跳', () => {
    const html = renderReport('引[2]再引[2]。\n\n## 来源\n2. [x](https://a.com/1) ．a.com\n');
    expect((html.match(/id="cite-2"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="#cite-2"');
  });
  it('历史 ISO 时区日期只展示日期部分', () => {
    const html = renderReport('## 来源\n1. [x](https://a.com/1) ．a.com [2026-01-25T16:00:00+00:00]\n');
    expect(html).toContain('class="ref-date">[2026-01-25]</span>');
    expect(html).not.toContain('16:00');
  });
});
