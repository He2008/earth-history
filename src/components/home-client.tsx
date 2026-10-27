'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction } from '@/lib/types';
import type { SeedPlace } from '@/lib/places';
import { placeInputOf, pickExplore, randomLatLon, seedPlaceDisplayName } from '@/lib/places';
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

type Mode = { kind: 'pick' } | { kind: 'confirm'; place: SeedPlace; subtitle?: string; coarse?: boolean } | { kind: 'research' };

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

  // 逆地理 → 确认弹窗(地球点击与全球随机共用);返回 land/ocean/error 供随机重抽
  const geocodeToDialog = useCallback(async (lat: number, lng: number): Promise<'land' | 'ocean' | 'error'> => {
    setPickError(null);
    try {
      const resp = await fetch(`/api/geocode?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        const msg: string = j?.error?.message ?? '定位失败';
        if (msg.includes('海洋')) return 'ocean';
        setPickError(msg);
        return 'error';
      }
      const r = await resp.json() as { place: { province: string; city: string | null; county: string }; formatted: string; poi: string | null; source: 'tianditu' | 'llm-region' };
      setMode({
        kind: 'confirm',
        place: { name: r.poi ?? r.place.county, province: r.place.province, city: r.place.city, county: r.place.county, lat, lng },
        subtitle: r.formatted,
        coarse: r.source === 'llm-region',
      });
      return 'land';
    } catch (e) {
      setPickError((e as Error).message || '这里定不了位,换一个点试试');
      return 'error';
    }
  }, []);

  // 地球点击 → 逆地理 → 确认弹窗(F2 + F3.1 主链路)
  const pickOnGlobe = useCallback(async (lat: number, lng: number) => {
    setGeocoding(true);
    try {
      const r = await geocodeToDialog(lat, lng);
      if (r === 'ocean') setPickError('这里是海洋——故事属于风与浪,点个陆地试试');
    } finally {
      setGeocoding(false);
    }
  }, [geocodeToDialog]);

  // F8 随便看看:80% 种子池 / 20% 全球纯随机(落海自动重抽,至多 3 次)
  const handleExplore = useCallback(async () => {
    const pick = pickExplore();
    if (pick.kind === 'pool') {
      setMode({ kind: 'confirm', place: pick.place });
      return;
    }
    setGeocoding(true);
    try {
      const spots = [pick, randomLatLon(), randomLatLon()];
      for (const spot of spots) {
        const r = await geocodeToDialog(spot.lat, spot.lng);
        if (r === 'land') return;
        if (r === 'error') return;
      }
      setPickError('连抽三次都是海,再试一次');
    } finally {
      setGeocoding(false);
    }
  }, [geocodeToDialog]);

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
        <span className="wordmark-sub">PLACE LORE</span>
      </header>
      <p className="tagline">每个地方都有来历,点一下就知道。</p>

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
            <PlacePicker onSelect={(p) => setMode({ kind: 'confirm', place: p })} onRandom={() => void handleExplore()} />
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
          coarse={mode.coarse}
          onCancel={() => setMode({ kind: 'pick' })}
          onConfirm={(d, extra) => startResearch(mode.place, d, extra)}
        />
      )}
    </div>
  );
}
