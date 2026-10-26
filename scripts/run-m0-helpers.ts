export function parseSseBlock(block: string): { event: string; data: any } | null {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const dataRaw = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !dataRaw) return null;
  try { return { event, data: JSON.parse(dataRaw) }; } catch { return null; }
}

export interface SummaryRow { name: string; slug: string; status: string; sourcesKept: number; yuan: number; elapsedMs: number }

export function summarize(rows: SummaryRow[]): string {
  const head = 'name,slug,status,sourcesKept,yuan,elapsedMs';
  return [head, ...rows.map((r) => `${r.name},${r.slug},${r.status},${r.sourcesKept},${r.yuan},${r.elapsedMs}`)].join('\n');
}
