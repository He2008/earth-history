import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '@/lib/url-norm';

describe('normalizeUrl', () => {
  it('去 utm 与常见追踪参数', () => {
    expect(normalizeUrl('https://Example.com/a?utm_source=x&utm_medium=y&id=1'))
      .toBe('https://example.com/a?id=1');
  });
  it('去锚点、主机小写、去尾斜杠', () => {
    expect(normalizeUrl('https://A.com/x/#sec')).toBe('https://a.com/x');
  });
  it('http/https 视为不同', () => {
    expect(normalizeUrl('http://a.com/x')).not.toBe(normalizeUrl('https://a.com/x'));
  });
  it('追踪参数大小写不敏感删除(含 bst/svcp_stk 等百科系参数)', () => {
    expect(normalizeUrl('https://baike.baidu.com/item/x/1?BST=123&svcp_stk=abc&id=2'))
      .toBe('https://baike.baidu.com/item/x/1?id=2');
  });
  it('百科移动域归一到桌面域:wapbaike/zh.m.wikipedia', () => {
    expect(normalizeUrl('https://wapbaike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657'))
      .toBe(normalizeUrl('https://baike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657'));
    expect(normalizeUrl('https://zh.m.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'))
      .toBe(normalizeUrl('https://zh.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'));
  });
  it('维基繁简变体路径归一:/zh-tw/条目 → /wiki/条目', () => {
    expect(normalizeUrl('https://zh.wikipedia.org/zh-tw/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'))
      .toBe(normalizeUrl('https://zh.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'));
    expect(normalizeUrl('https://zh.wikipedia.org/zh-cn/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'))
      .toBe(normalizeUrl('https://zh.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E'));
  });
  it('实测样例:浆洗街任务里的重复四条应两两归一', () => {
    const baike = 'https://baike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657';
    expect(normalizeUrl('https://wapbaike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657')).toBe(baike);
    expect(normalizeUrl('https://baike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657?bst=1791764865.x')).toBe(baike);
    expect(normalizeUrl('https://baike.baidu.com/item/%E5%B0%91%E5%9F%8E/266657?bst=1.y&svcp_stk=1_z')).toBe(baike);
    const wiki = 'https://zh.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E';
    expect(normalizeUrl('https://zh.m.wikipedia.org/wiki/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E')).toBe(wiki);
    expect(normalizeUrl('https://zh.wikipedia.org/zh-tw/%E6%88%90%E9%83%BD%E5%B0%91%E5%9F%8E')).toBe(wiki);
  });
  it('畸形 URL 原样返回不抛错(合法的非特殊协议 httpx:// 会被 URL 正常解析,不属此类)', () => {
    expect(normalizeUrl('http://[::1')).toBe('http://[::1');
    expect(normalizeUrl('没有协议的裸串')).toBe('没有协议的裸串');
    expect(normalizeUrl('')).toBe('');
  });
});
