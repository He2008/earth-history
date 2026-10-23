import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import locations from './locations.json';
import { parseSseBlock, summarize, type SummaryRow } from './run-m0-helpers';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve('reports', new Date().toISOString().replace(/[:.]/g, '-'));

async function runOne(loc: (typeof locations)[number]): Promise<{ row: SummaryRow; cached: boolean }> {
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat: loc.lat, lng: loc.lng, place: loc.place, direction: loc.direction }),
  });
  if (!resp.ok) {
    return { row: { name: loc.name, slug: loc.slug, status: `failed:http_${resp.status}`, sourcesKept: 0, yuan: 0, elapsedMs: Date.now() - t0 }, cached: false };
  }
  let md = '';
  let status = 'unknown';
  let sourcesKept = 0;
  let yuan = 0;
  let taskId = '';
  let cached = false;
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const parsed = parseSseBlock(buf.slice(0, i));
      buf = buf.slice(i + 2);
      if (!parsed) continue;
      if (parsed.event === 'progress' || parsed.event === 'search_hit') console.log(`  [${loc.slug}] ${parsed.event}: ${String(parsed.data.note ?? parsed.data.query ?? '')}`);
      if (parsed.event === 'task_created') { taskId = parsed.data.taskId ?? ''; cached = !!parsed.data.cached; }
      if (parsed.event === 'content') md += parsed.data.delta ?? '';
      if (parsed.event === 'done') { status = parsed.data.status; sourcesKept = parsed.data.sourcesKept ?? 0; yuan = parsed.data.yuan ?? 0; }
      if (parsed.event === 'error') status = `failed:${parsed.data.code}`;
    }
  }
  // 报告以 DB 终稿为准(一切状态可从 DB 重建);流式增量仅作兜底——
  // dev 模式下 Next 的流式转发层可能丢高频 content 事件,但 DB 始终完整
  if (taskId && (status === 'completed' || status === 'scarce')) {
    try {
      const t = await (await fetch(`${BASE}/api/research/${taskId}`)).json();
      if (t?.task?.report_md) md = t.task.report_md;
    } catch { /* 兜底:用已收到的流式增量 */ }
  }
  writeFileSync(path.join(OUT, `${loc.slug}.md`), `# ${loc.name}\n\n${md}\n`);
  return { row: { name: loc.name, slug: loc.slug, status, sourcesKept, yuan, elapsedMs: Date.now() - t0 }, cached };
}

async function main() {
  // 每次最多跑 N 个「新」地点(缓存回放免费不计入);控制单次花费,默认 3 ≈ ¥0.25
  const limit = Math.max(1, Number(process.argv[2] ?? process.env.M0_LIMIT ?? 3));
  mkdirSync(OUT, { recursive: true });
  const rows: SummaryRow[] = [];
  let fresh = 0;
  for (const loc of locations) {
    if (fresh >= limit) {
      const rest = locations.slice(locations.indexOf(loc)).map((l) => l.name).join('、');
      console.log(`⏸ 已达本次新地点上限(${limit}),留到下次:${rest}`);
      break;
    }
    console.log(`▶ ${loc.name}(${loc.direction})`);
    try {
      const { row, cached } = await runOne(loc);
      rows.push(row);
      if (!cached) fresh++;
    } catch (e) {
      console.error(`✗ ${loc.name}: ${e}`);
      rows.push({ name: loc.name, slug: loc.slug, status: 'error', sourcesKept: 0, yuan: 0, elapsedMs: 0 });
      fresh++; // 失败通常也已产生部分花费,同样计入上限
    }
  }
  writeFileSync(path.join(OUT, 'summary.csv'), summarize(rows));
  console.log(`\n=== M0 汇总(本次新跑 ${fresh}/${limit},缓存回放免费)===`);
  console.table(rows);
  console.log(`报告目录: ${OUT}`);
}

void main();
