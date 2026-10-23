interface SourceLike { idx: number; title: string; url: string; snippet: string; published_at?: string | null }

// 来源标题清洗:搜索结果的 title 常是 HTML 残片/摘要碎片/重复的"站点名 - 站名牌"
export function cleanTitle(raw: string): string {
  let t = raw.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const dup = t.match(/^(.{2,60}?) - \1$/);
  if (dup) t = dup[1];
  return t.slice(0, 60);
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
