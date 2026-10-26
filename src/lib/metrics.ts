// 「节省指标」(PRD P1,2026-10-26 拉前):替用户省下的人工检索时间估算——营销口径,非精确账
// 口径参考原项目 metrics-calculator($200/h 折算那套)按中文文史场景校准,常量集中此处
const FIND_MIN_PER_SOURCE = 8; // 人工找源
const READ_MIN_PER_SOURCE = 12; // 人工精读
const WRITE_MIN_PER_CHAR = 0.08; // 人工成文(分/字)

export interface MetricsInput { sourcesKept: number; reportChars: number }
export interface ResearchMetrics { sourcesKept: number; charsRead: number; minutesSaved: number }

export function estimateMinutesSaved({ sourcesKept, reportChars }: MetricsInput): number {
  if (sourcesKept <= 0) return 0;
  return Math.round(sourcesKept * (FIND_MIN_PER_SOURCE + READ_MIN_PER_SOURCE) + reportChars * WRITE_MIN_PER_CHAR);
}

export function formatSavedTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

export function formatCharsRead(chars: number): string {
  if (chars >= 10000) return `约 ${(chars / 10000).toFixed(1)} 万字`;
  return `约 ${chars} 字`;
}
