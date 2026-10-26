import { describe, it, expect } from 'vitest';
import { buildSourcePack, validateCitations, cleanTitle, extractCitedSentence, hasCitation, sourceTitle } from '@/server/orchestrator/citations';

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

describe('sourceTitle(PDF 残句标题兜底)', () => {
  it('文档 URL + 残句标题(<6字)→ 用 snippet 标题行替换(实测「三伍」案例)', () => {
    const t = sourceTitle({ title: '三伍', url: 'http://scdfz.sc.gov.cn/a/b.pdf', snippet: '# 辛亥秋保路死事纪念碑  \n\n辛亥秋保路死事纪念碑位于成都市人民公园内' });
    expect(t).toBe('辛亥秋保路死事纪念碑');
  });
  it('文档 URL + 残句标题 → 无标题行时取 snippet 首个逗号子句(实测「陆续送川」案例)', () => {
    const t = sourceTitle({ title: '陆续送川', url: 'http://scdfz.sc.gov.cn/a/c.pdf', snippet: '康熙五十七年(1718年),四川总督年羹尧上疏“成都驻扎满兵,……其官属兵房' });
    expect(t).toBe('康熙五十七年(1718年)');
  });
  it('文档 URL + 信息量足够的标题 → 保留(实测康熙重修成都城案例)', () => {
    const t = sourceTitle({ title: '清康熙初,四川巡抚张德地捐资重修成都城', url: 'http://scdfz.sc.gov.cn/a/d.pdf', snippet: '任意' });
    expect(t).toBe('清康熙初,四川巡抚张德地捐资重修成都城');
  });
  it('非文档 URL 的短标题不替换(「少城」是合法标题)', () => {
    const t = sourceTitle({ title: '少城', url: 'https://baike.baidu.com/item/x', snippet: '成都老城区西部区域' });
    expect(t).toBe('少城');
  });
  it('文档残句但 snippet 无可用料 → cleanTitle 兜底', () => {
    const t = sourceTitle({ title: '三伍', url: 'http://x.gov.cn/a.pdf', snippet: '' });
    expect(t).toBe('三伍');
  });
  it('仍走 cleanTitle 清洗(HTML/超长)', () => {
    const t = sourceTitle({ title: '<b>少城</b> - 少城', url: 'https://a.com/x', snippet: '' });
    expect(t).toBe('少城');
  });
  it('卷期编号是垃圾(实测「第18卷 第2期」,下载端点无 .pdf 扩展也要识别为文档)', () => {
    const t = sourceTitle({ title: '第18卷 第2期', url: 'http://xuebao.lsnu.edu.cn/system/_content/download.jsp?urltype=news.DownloadAttachUrl&owner=1&wbfileid=4532533', snippet: '民国时期(1912—1937)乐山城市近代化进程研究 * ... 摘 要:民国时期(1921—1937)年乐山城市近代化在晚清的基础上展开' });
    expect(t).toBe('民国时期(1912—1937)乐山城市近代化进程研究');
  });
  it('掐头去尾的长残句是垃圾,snippet 剥 [n] 引用标记后取首子句(实测「侣们或出自名门望族…」)', () => {
    const t = sourceTitle({ title: '侣们或出自名门望族，本身就具备经济资本、文化资本和社会资本的物质和精神资格和能力，当然是藏区社会的权力把持者；或僧侣们出', url: 'https://law.swust.edu.cn/_upload/article/files/e1/67/x/2a193913.pdf', snippet: '[15]不同教派的寺院和僧人与地方封建势力之间相互结合，互为依赖，上层僧人维持着特权' });
    expect(t).toBe('不同教派的寺院和僧人与地方封建势力之间相互结合');
  });
  it('中等长度的信息型残句保留(实测「同年8月,张大千…写生、创作」28 字)', () => {
    const t = sourceTitle({ title: '同年8月,张大千率领学生肖建初、翟道刚等10余人来山写生、创作', url: 'http://scdfz.sc.gov.cn/a/f.pdf', snippet: '同年10月1日援华抗日美军运输机一架,从印度起飞' });
    expect(t).toBe('同年8月,张大千率领学生肖建初、翟道刚等10余人来山写生、创作');
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
  it('剥离尾部面包屑/站点导航段(实测峨眉山任务:「- 当前位置：首页 > …」「| 欢迎来到…」)', () => {
    expect(cleanTitle('乐山市切实加强和规范宗教活动场所文物保护工作 - 当前位置：首页 > 活动场所'))
      .toBe('乐山市切实加强和规范宗教活动场所文物保护工作');
    expect(cleanTitle('“灭绝师太”和乐山啥关系？-四川峨眉武术文化普及基地 - | 欢迎来到四川省峨眉武术文化普及基地'))
      .toBe('“灭绝师太”和乐山啥关系？-四川峨眉武术文化普及基地');
  });
  it('站名在左文题在右的标题不误剥(实测「市政协 - 发言摘登」)', () => {
    expect(cleanTitle('中国人民政治协商会议乐山市委员会 - 市政协八届常委会第二十次会议发言摘登'))
      .toBe('中国人民政治协商会议乐山市委员会 - 市政协八届常委会第二十次会议发言摘登');
  });
});
