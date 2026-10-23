interface SourceLike { idx: number; title: string; url: string; snippet: string; published_at?: string | null }

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
