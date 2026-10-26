import { renderReport } from '@/lib/md';
import { formatSavedTime, formatCharsRead, type ResearchMetrics } from '@/lib/metrics';

function MetricsPills({ m }: { m: ResearchMetrics }) {
  if (m.minutesSaved <= 0) return null;
  return (
    <div className="metrics-pills" aria-label="节省指标">
      <span className="pill">{m.sourcesKept} 个来源</span>
      <span className="pill">{formatCharsRead(m.charsRead)}</span>
      <span className="pill pill-accent">人工检索约需 {formatSavedTime(m.minutesSaved)}</span>
    </div>
  );
}

// 报告视图:档案排版(衬线),来源列表已含在 report_md 尾部
// 成本(¥)是内部遥测指标(cost_json/日志),不进用户界面——用户可见的是「节省指标」(PRD P1)
export function ReportView({ reportMd, scarcity, meta, metrics }: {
  reportMd: string;
  scarcity: boolean;
  meta?: { placeName?: string; direction?: string; createdAt?: number; elapsedMs?: number | null };
  metrics?: ResearchMetrics | null;
}) {
  const bits: string[] = [];
  if (meta?.direction) bits.push(meta.direction);
  if (meta?.createdAt) bits.push(new Date(meta.createdAt).toLocaleString('zh-CN', { hour12: false }));
  if (meta?.elapsedMs) bits.push(`${Math.round(meta.elapsedMs / 1000)}s`);

  // 档案模式:羊皮纸图版(atlas 主题),研究页与分享页共用
  return (
    <article data-theme="atlas" className="archive">
      {scarcity && (
        <div className="scarce-banner" role="status">
          <span>⚠</span>
          <span>公开资料稀缺。以下为该地行政区划与地理背景,不含未经证实的细节。</span>
        </div>
      )}
      {bits.length > 0 && <p className="report-meta">{bits.join(' · ')}</p>}
      <div className="report" dangerouslySetInnerHTML={{ __html: renderReport(reportMd) }} />
      {metrics && <MetricsPills m={metrics} />}
    </article>
  );
}
