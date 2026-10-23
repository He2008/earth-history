import { renderReport } from '@/lib/md';

// 报告视图:档案排版(衬线),来源列表已含在 report_md 尾部
export function ReportView({ reportMd, scarcity, meta }: {
  reportMd: string;
  scarcity: boolean;
  meta?: { placeName?: string; direction?: string; createdAt?: number; elapsedMs?: number | null; yuan?: number | null };
}) {
  const bits: string[] = [];
  if (meta?.direction) bits.push(meta.direction);
  if (meta?.createdAt) bits.push(new Date(meta.createdAt).toLocaleString('zh-CN', { hour12: false }));
  if (meta?.elapsedMs) bits.push(`${Math.round(meta.elapsedMs / 1000)}s`);
  if (meta?.yuan != null) bits.push(`¥${meta.yuan.toFixed(2)}`);

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
    </article>
  );
}
