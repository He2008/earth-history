'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction } from '@/lib/types';
import type { SeedPlace } from '@/lib/places';
import { placeInputOf, pickRandomPlace, seedPlaceDisplayName } from '@/lib/places';
import { streamResearch, type TaskDetail } from '@/lib/research-client';
import type { ResearchFeedState } from '@/lib/sse';
import { loadHistory, pushHistory, removeHistory, type HistoryEntry } from '@/lib/history';
import { Globe } from '@/components/globe';
import { PlacePicker } from '@/components/place-picker';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResearchPanel } from '@/components/research-panel';
import { ReportView } from '@/components/report-view';
import { ReportActions } from '@/components/report-actions';
import { HistoryList } from '@/components/history-list';
import { AiBadge } from '@/components/ai-badge';

type Mode = { kind: 'pick' } | { kind: 'confirm'; place: SeedPlace; subtitle?: string } | { kind: 'research' };

export function HomeClient({ tdtKey }: { tdtKey: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [feed, setFeed] = useState<ResearchFeedState | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyWrittenFor = useRef<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory(window.localStorage));
    return () => abortRef.current?.abort();
  }, []);

  // 地球点击 → 逆地理 → 确认弹窗(F2 + F3.1 主链路)
  const pickOnGlobe = useCallback(async (lat: number, lng: number) => {
    setPickError(null);
    setGeocoding(true);
    try {
      const resp = await fetch(`/api/geocode?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        throw new Error(j?.error?.message ?? '定位失败');
      }
      const r = await resp.json() as { place: { province: string; city: string | null; county: string }; formatted: string; poi: string | null };
      setMode({
        kind: 'confirm',
        place: { name: r.poi ?? r.place.county, province: r.place.province, city: r.place.city, county: r.place.county, lat, lng },
        subtitle: r.formatted,
      });
    } catch (e) {
      setPickError((e as Error).message || '这里定不了位,换一个点试试');
    } finally {
      setGeocoding(false);
    }
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
    <div className="shell shell-wide">
      <header className="masthead">
        <h1 className="wordmark">史地</h1>
        <span className="wordmark-sub">SHI · DI</span>
      </header>
      <p className="tagline">在地球上点一个地方,问它的历史。AI 检索方志、档案与论文,几分钟产出带引用的报告。</p>

      <main id="main-content">
        {!researching && (
          <>
            {tdtKey ? (
              <>
                <p className="section-label">点击地球选点</p>
                <Globe tdtKey={tdtKey} onPick={pickOnGlobe} busy={geocoding} />
                {pickError && <p className="pick-error" role="alert">{pickError}</p>}
              </>
            ) : null}
            <p className="section-label">{tdtKey ? '或者从种子池选' : '选择地点'}</p>
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
                  meta={{ placeName: detail.placeName, direction: detail.direction, createdAt: detail.createdAt, elapsedMs: detail.totalMs }}
                  metrics={detail.metrics}
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
          subtitle={mode.subtitle}
          onCancel={() => setMode({ kind: 'pick' })}
          onConfirm={(d, extra) => startResearch(mode.place, d, extra)}
        />
      )}
    </div>
  );
}
