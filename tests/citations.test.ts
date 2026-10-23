import { describe, it, expect } from 'vitest';
import { buildSourcePack, validateCitations, cleanTitle, extractCitedSentence, hasCitation } from '@/server/orchestrator/citations';

describe('buildSourcePack', () => {
  it('编号·标题·域名·日期+摘要', () => {
    const pack = buildSourcePack([
      { idx: 1, title: '云龙县志', url: 'https://dfz.yn.gov.cn/a', snippet: '摘要一', published_at: '2021-03-01' },
      { idx: 2, title: '诺邓', url: 'https://b.com/x', snippet: '摘要二', published_at: null },
    ]);
    expect(pack).toContain('[1] 云龙县志 · dfz.yn.gov.cn · 2021-03-01');
    expect(pack).toContain('摘要一');
    expect(pack).toContain('日期未知');
  });
});

describe('validateCitations', () => {
  it('保留合法编号,剔除越界与自创编号并计数', () => {
    const r = validateCitations('秦置[1],唐置[2],伪引[9]与[0]与[abc]', 2);
    expect(r.report).toBe('秦置[1],唐置[2],伪引与与[abc]');
    expect(r.invalidCount).toBe(2);
  });
  it('无引用时零改动', () => {
    const r = validateCitations('纯文本[3]', 5);
    expect(r.report).toBe('纯文本[3]');
    expect(r.invalidCount).toBe(0);
  });
});

describe('extractCitedSentence(被引单句回写,TDD §4 quote 列)', () => {
  const md = '第一句引一[1]。第二句引十二[12]!再引一次一[1]呢?换行后\n第三句引二[2];';
  it('取首个被引句,含终结符,按句子边界切分', () => {
    expect(extractCitedSentence(md, 1)).toBe('第一句引一[1]。');
    expect(extractCitedSentence(md, 12)).toBe('第二句引十二[12]!');
    expect(extractCitedSentence(md, 2)).toBe('第三句引二[2];');
  });
  it('[1] 不误配 [12] 的子串(编号精确匹配)', () => {
    expect(extractCitedSentence('只引十二[12]', 1)).toBeNull();
  });
  it('未被引用的编号返回 null', () => {
    expect(extractCitedSentence(md, 9)).toBeNull();
  });
  it('超长句截断 200 字(落库合规口径)', () => {
    const long = '字'.repeat(300) + '[1]。';
    expect(extractCitedSentence(long, 1)!.length).toBe(200);
  });
});

describe('hasCitation(编号精确匹配)', () => {
  it('[1] 不命中 [12],[12] 不被 [1] 抢占', () => {
    expect(hasCitation('文[12]尾', 1)).toBe(false);
    expect(hasCitation('文[12]尾', 12)).toBe(true);
    expect(hasCitation('文[1]尾', 1)).toBe(true);
  });
});

describe('cleanTitle', () => {
  it('去 HTML 标签并压缩空白', () => {
    expect(cleanTitle('<table><tr><td>13102</td><td>敦煌市民宿</td></tr></table>')).toBe('13102 敦煌市民宿');
  });
  it('去"a - a"式重复标题', () => {
    expect(cleanTitle('平遥城墙 - 平遥城墙')).toBe('平遥城墙');
  });
  it('超长截断到 60 字', () => {
    expect(cleanTitle('标'.repeat(80)).length).toBe(60);
  });
  it('正常标题原样保留(60 字内)', () => {
    expect(cleanTitle('京兆府-陕西省地方志办公室')).toBe('京兆府-陕西省地方志办公室');
  });
});
