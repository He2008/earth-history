'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchTaskDetail, pollRelay, type TaskDetail } from '@/lib/research-client';
import { applySseEvent, initialFeedState, type ResearchFeedState } from '@/lib/sse';
import { ResearchPanel } from '@/components/research-panel';
import { ReportView } from '@/components/report-view';
import { ReportActions } from '@/components/report-actions';
import { AiBadge } from '@/components/ai-badge';

const TERMINAL = new Set(['completed', 'scarce', 'failed']);

// F3.2 刷新恢复:GET /:id 全量重建;运行中转 /poll 接力
export default function ResearchRestorePage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [feed, setFeed] = useState<ResearchFeedState | null>(null);
  const [missing, setMissing] = useState(false);

  // 生命周期完全由 AbortController 管:卸载即中止轮询;不用 ref 防重入——
  // React StrictMode(开发态)会 挂载→清理→再挂载,ref 守卫会让真正的那次挂载空转,恢复页变空白(2026-10-26 自测实锤)
  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const d = await fetchTaskDetail(id);
      if (ac.signal.aborted) return;
      if (!d) { setMissing(true); return; }
      setDetail(d);
      if (!TERMINAL.has(d.status)) {
        let f = initialFeedState();
        f.taskId = id;
        f.status = 'running';
        for (const note of d.timeline) f = applySseEvent(f, { event: 'progress', data: note });
        f.phase = d.status;
        setFeed(f);
        void pollRelay(id, setFeed, setDetail, ac.signal);
      }
    })();
    return () => ac.abort();
  }, [id]);

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">史地</h1>
        <Link className="wordmark-sub" href="/">← 回首页</Link>
      </header>

      <main id="main-content">
        {missing && (
          <p className="muted">没有找到这个任务。可能链接已失效,或任务尚未创建。</p>
        )}
        {detail && !TERMINAL.has(detail.status) && feed && (
          <>
            <p className="section-label">研究进度 · 恢复</p>
            <ResearchPanel state={feed} placeName={detail.placeName} />
          </>
        )}
        {detail && TERMINAL.has(detail.status) && detail.status !== 'failed' && (
          <>
            <p className="section-label">{detail.placeName} · {detail.direction}</p>
            <ReportView
              reportMd={detail.reportMd}
              scarcity={detail.scarcity}
              meta={{ placeName: detail.placeName, direction: detail.direction, createdAt: detail.createdAt, elapsedMs: detail.totalMs }}
                  metrics={detail.metrics}
            />
            <ReportActions taskId={detail.taskId} shareToken={detail.shareToken} />
          </>
        )}
        {detail && detail.status === 'failed' && (
          <>
            <p className="section-label">研究失败</p>
            <ResearchPanel
              state={{ ...initialFeedState(), taskId: detail.taskId, status: 'failed', phase: 'failed', notes: detail.timeline, error: { code: detail.errorCode ?? 'internal', message: detail.errorMsg ?? '' } }}
              placeName={detail.placeName}
            />
            <div className="report-actions">
              <Link className="btn" href="/">换个地方</Link>
            </div>
          </>
        )}
      </main>

      <footer className="site-foot">
        <AiBadge />
        <span className="mono">史地 · 内测</span>
      </footer>
    </div>
  );
}
