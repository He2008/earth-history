'use client';

import { useEffect, useRef, useState } from 'react';
import type { Direction } from '@/lib/types';
import type { SeedPlace } from '@/lib/places';
import { placeInputOf, seedPlaceDisplayName } from '@/lib/places';
import { streamResearch, type TaskDetail } from '@/lib/research-client';
import type { ResearchFeedState } from '@/lib/sse';
import { loadHistory, pushHistory, removeHistory, type HistoryEntry } from '@/lib/history';
import { PlacePicker } from '@/components/place-picker';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResearchPanel } from '@/components/research-panel';
import { ReportView } from '@/components/report-view';
import { ReportActions } from '@/components/report-actions';
import { HistoryList } from '@/components/history-list';
import { AiBadge } from '@/components/ai-badge';

type Mode = { kind: 'pick' } | { kind: 'confirm'; place: SeedPlace } | { kind: 'research' };

export default function Home() {
  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [feed, setFeed] = useState<ResearchFeedState | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const historyWrittenFor = useRef<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory(window.localStorage));
    return () => abortRef.current?.abort();
  }, []);

  const startResearch = (place: SeedPlace, direction: Direction, extra: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    historyWrittenFor.current = null;
    setDetail(null);
    setFeed(null);
    setMode({ kind: 'research' });
    void streamResearch(
      { lat: place.lat, lng: place.lng, place: placeInputOf(place), direction, extra: extra || undefined },
      (s) => {
        setFeed(s);
        if (s.taskId && historyWrittenFor.current !== s.taskId) {
          historyWrittenFor.current = s.taskId; // task_created 即落历史(F6/TDD §5)
          setHistory(pushHistory(window.localStorage, { taskId: s.taskId, place: seedPlaceDisplayName(place), direction, ts: Date.now() }));
        }
      },
      setDetail,
      ac.signal,
    );
  };

  const researching = mode.kind === 'research';

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">史地</h1>
        <span className="wordmark-sub">SHI · DI</span>
      </header>
      <p className="tagline">点一个地方,问它的历史。AI 检索方志、档案与论文,几分钟产出带引用的报告。</p>

      <main id="main-content">
        {!researching && (
          <>
            <p className="section-label">选择地点</p>
            <PlacePicker onSelect={(p) => setMode({ kind: 'confirm', place: p })} />
            <p className="section-label">最近研究</p>
            <HistoryList
              items={history}
              onOpen={(taskId) => { window.location.href = `/research/${taskId}`; }}
              onRemove={(taskId) => setHistory(removeHistory(window.localStorage, taskId))}
            />
          </>
        )}

        {researching && feed && (
          <>
            <p className="section-label">研究进度</p>
            <ResearchPanel state={feed} placeName={detail?.placeName ?? history[0]?.place} />
            {feed.status === 'failed' && (
              <div className="report-actions">
                <button className="btn" onClick={() => setMode({ kind: 'pick' })}>换个地方</button>
              </div>
            )}
            {detail && detail.status !== 'failed' && (
              <>
                <hr className="hr" />
                <p className="section-label">研究报告</p>
                <ReportView
                  reportMd={detail.reportMd}
                  scarcity={detail.scarcity}
                  meta={{ placeName: detail.placeName, direction: detail.direction, createdAt: detail.createdAt, elapsedMs: detail.totalMs, yuan: detail.yuan }}
                />
                <ReportActions taskId={detail.taskId} shareToken={detail.shareToken} />
                <div className="report-actions">
                  <button className="btn" onClick={() => setMode({ kind: 'pick' })}>再研究一处</button>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <footer className="site-foot">
        <AiBadge />
        <span className="mono">史地 · 内测</span>
      </footer>

      {mode.kind === 'confirm' && (
        <ConfirmDialog
          place={mode.place}
          onCancel={() => setMode({ kind: 'pick' })}
          onConfirm={(d, extra) => startResearch(mode.place, d, extra)}
        />
      )}
    </div>
  );
}
