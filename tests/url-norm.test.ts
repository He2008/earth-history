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
  it('追踪参数大小写不敏感删除(含 bst/svcp_stk 等百科系参数;百科词条 ID 段一并折叠)', () => {
    expect(normalizeUrl('https://baike.baidu.com/item/x/1?BST=123&svcp_stk=abc&id=2'))
      .toBe('https://baike.baidu.com/item/x?id=2');
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
  it('实测样例:浆洗街任务里的重复四条应两两归一(词条 ID 段也折叠)', () => {
    const baike = 'https://baike.baidu.com/item/%E5%B0%91%E5%9F%8E';
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
  it('百分号编码大小写折叠(实测峨眉山任务:小写 %e5 与大写 %E5 是同一路径)', () => {
    expect(normalizeUrl('https://baike.baidu.com/item/%e5%b3%a8%e7%9c%89%e5%b1%b1'))
      .toBe(normalizeUrl('https://baike.baidu.com/item/%E5%B3%A8%E7%9C%89%E5%B1%B1'));
  });
  it('百科词条 ID 段与 fromModule/structure 系参数折叠(实测:峨眉山古建筑群四条 → 一条)', () => {
    const canon = normalizeUrl('https://baike.baidu.com/item/%E5%B3%A8%E7%9C%89%E5%B1%B1%E5%8F%A4%E5%BB%BA%E7%AD%91%E7%BE%A4');
    expect(normalizeUrl('https://baike.baidu.com/item/%E5%B3%A8%E7%9C%89%E5%B1%B1%E5%8F%A4%E5%BB%BA%E7%AD%91%E7%BE%A4/4278752')).toBe(canon);
    expect(normalizeUrl('https://baike.baidu.com/item/%E5%B3%A8%E7%9C%89%E5%B1%B1%E5%8F%A4%E5%BB%BA%E7%AD%91%E7%BE%A4/4278752?fromModule=lemma_inlink')).toBe(canon);
    expect(normalizeUrl('https://baike.baidu.com/item/%E5%B3%A8%E7%9C%89%E5%B1%B1%E5%8F%A4%E5%BB%BA%E7%AD%91%E7%BE%A4/4278752?fromModule=lemma_starMap&lemmaFrom=lemma_relation_starMap&structureId=061aa7ee62c5bfb08b38b0a6&structureClickId=4278752&structureItemId=bad7cf3594348f09e4e333ef&lemmaIdFrom=4278752')).toBe(canon);
  });
});
