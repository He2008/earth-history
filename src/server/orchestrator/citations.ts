interface SourceLike { idx: number; title: string; url: string; snippet: string; published_at?: string | null }

// 来源标题清洗:搜索结果的 title 常是 HTML 残片/摘要碎片/重复的"站点名 - 站名牌"/尾部面包屑
export function cleanTitle(raw: string): string {
  let t = raw.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  // 剥离尾部面包屑/站点导航段(「- 当前位置:首页 > …」「- | 欢迎来到…」);只在尾段含导航词时剥,避免误伤「站名 - 文题」
  for (;;) {
    const next = t.replace(/(?:\s*[-_|]\s*)+[^-_|]*(?:首页|当前位置|欢迎来到|手机版|网站地图)[^-_|]*$/i, '');
    if (next === t || next.length < 6) break;
    t = next.trim();
  }
  const dup = t.match(/^(.{2,60}?) - \1$/);
  if (dup) t = dup[1];
  return t.slice(0, 60);
}

// 文档类来源(PDF/Office/下载端点)没有页面标题,搜索引擎常把正文残句当标题。
// 峨眉山任务实测的垃圾形态:短残句(「三伍」)、卷期编号(「第18卷 第2期」)、掐头去尾的长残句(「侣们或出…把持者;或僧侣们出」)。
const JUNK_TITLE_MAX = 6;
const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?)(?:[?#]|$)/i;
const isDocumentUrl = (url: string): boolean => DOC_EXT.test(url) || /download|attach/i.test(url);
const isJunkDocTitle = (t: string): boolean =>
  t.length < JUNK_TITLE_MAX ||
  /^[第\d\s卷期.,，;；-]+$/.test(t) ||          // 卷期/纯编号
  t.includes('；') ||                            // 分号几乎只出现在正文复句里
  ((t.includes(',') || t.includes('，')) && t.length > 32); // 长逗号复句 = 正文截段(阈值 32:31 字的信息型残句「同年8月,张大千…」保留)

// snippet 提炼标题:markdown 标题行 → 首行(遇「 * 」/省略号截断,无标点) → 首个逗号子句;剥 [n] 引用标记
function snippetTitle(snippet: string): string | null {
  const stripMark = (s: string) => s.replace(/^\[\d{1,3}\]\s*/, '').trim();
  const lines = snippet.split('\n').map((l) => l.trim()).filter(Boolean);
  const heading = lines.map((l) => /^#{1,3}\s+(.{2,40})$/.exec(l)?.[1]).find(Boolean);
  if (heading) return heading.trim();
  if (lines[0]) {
    const first = stripMark(lines[0].split(/ \* |\.\.\.|…/)[0] ?? lines[0]);
    if (first.length >= 8 && first.length <= 40 && !/[,，;；]/.test(first)) return first;
  }
  const flat = stripMark(snippet.trim());
  const clause = flat.match(/^([^,，]{8,40})[,，]/);
  if (clause) return clause[1].trim();
  return null;
}

export function sourceTitle(hit: { title: string; url: string; snippet: string }): string {
  const cleaned = cleanTitle(hit.title);
  if (!isDocumentUrl(hit.url) || !isJunkDocTitle(cleaned)) return cleaned;
  return snippetTitle(hit.snippet)?.slice(0, 40) ?? cleaned;
}

export function buildSourcePack(kept: SourceLike[]): string {
  return kept
    .map((s) => {
      let host = '';
      try { host = new URL(s.url).hostname; } catch { host = 'unknown'; }
      return `[${s.idx}] ${s.title} · ${host} · ${s.published_at ?? '日期未知'}\n${s.snippet}`;
    })
    .join('\n\n');
}

export function validateCitations(report: string, maxIdx: number): { report: string; invalidCount: number } {
  let invalidCount = 0;
  const report2 = report.replace(/\[(\d{1,3})\]/g, (m, n: string) => {
    const i = Number(n);
    return i >= 1 && i <= maxIdx ? m : (invalidCount++, '');
  });
  return { report: report2, invalidCount };
}

// 编号精确匹配:[1] 不得被 [12] 的子串干扰(与 validateCitations 同一口径)
export function hasCitation(text: string, idx: number): boolean {
  return new RegExp(`(?<!\\d)\\[${idx}\\](?!\\d)`).test(text);
}

const SENTENCE_DELIMS = ['\n', '。', '!', '?', ';', '!', '?', ';'];
const QUOTE_MAX_CHARS = 200; // 落库合规口径:snippet 与被引单句均 ≤200 字(PREP §4)

// 被引单句(TDD §4 sources.quote):取正文中首个引用该编号的完整句子,供来源核查
export function extractCitedSentence(report: string, idx: number): string | null {
  const re = /(?<!\d)\[(\d{1,3})\](?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(report)) !== null) {
    if (Number(m[1]) !== idx) continue;
    let start = -1;
    for (const d of SENTENCE_DELIMS) start = Math.max(start, report.lastIndexOf(d, m.index));
    let end = report.length;
    for (const d of SENTENCE_DELIMS) {
      const i = report.indexOf(d, m.index + m[0].length);
      if (i !== -1) end = Math.min(end, i);
    }
    const sentence = report.slice(start + 1, end < report.length ? end + 1 : end).trim();
    return sentence.slice(0, QUOTE_MAX_CHARS) || null;
  }
  return null;
}
