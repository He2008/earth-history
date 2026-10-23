import { describe, it, expect } from 'vitest';
import { buildSourcePack, validateCitations, cleanTitle } from '@/server/orchestrator/citations';

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
