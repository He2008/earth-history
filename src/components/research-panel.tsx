'use client';

import { useEffect, useRef } from 'react';
import type { ResearchFeedState } from '@/lib/sse';

const PHASE_LABEL: Record<string, string> = {
  queued: '排队中',
  planning: '拆解研究子问题',
  searching: '多轮检索史料',
  fetching: '抓取来源正文',
  synthesizing: '综合成文',
  scarce: '资料稀缺降级',
  completed: '研究完成',
  failed: '研究失败',
};

const hhmmss = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });

// 研究遥测面板:事件逐条下行,像地面站接收任务回传
export function ResearchPanel({ state, placeName }: { state: ResearchFeedState; placeName?: string }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.notes.length]);

  const running = state.status === 'running' || state.status === 'idle';
  const dotClass = state.status === 'failed' ? 'fail' : state.status === 'scarce' ? 'warn' : running ? 'live' : '';
  const title = placeName ?? (state.taskId ? `任务 ${state.taskId}` : '新任务');

  return (
    <section className="panel" aria-label="研究进度">
      <div className="panel-head">
        <span className={`status-dot ${dotClass}`} aria-hidden="true" />
        <h2 className="panel-title" style={{ fontSize: 16 }}>{title}</h2>
        <span className="panel-meta">
          {PHASE_LABEL[state.phase] ?? state.phase}
          {state.hits.length > 0 && ` · ${state.hits.length} 轮检索`}
          {state.cached && ' · 缓存回放'}
          {state.continuePolling && ' · 轮询接力'}
        </span>
      </div>
      <div className="tele-log" ref={logRef}>
        {state.notes.map((n, i) => (
          <div key={i} className={`tele-row ${n.phase === 'searching' ? 'is-search' : n.phase === 'failed' ? 'is-fail' : 'is-phase'}`}>
            <span className="tele-dot" aria-hidden="true" />
            <span className="tele-time">{hhmmss(n.ts)}</span>
            <span className="tele-note">{n.note}</span>
          </div>
        ))}
      </div>
      {(running && state.content) ? (
        <div className="stream-preview" aria-label="正文预览">
          {state.content.slice(-600)}
          <span className="caret" aria-hidden="true">▌</span>
        </div>
      ) : null}
      {state.status === 'failed' && state.error && (
        <p style={{ color: 'var(--status-danger)', margin: '12px 0 0', fontSize: 14 }}>
          {state.error.code === 'llm_all_failed' ? '模型链路全部失败,稍后重试。' : state.error.code === 'search_all_failed' ? '搜索链路全部失败,稍后重试。' : `研究失败:${state.error.message}`}
        </p>
      )}
    </section>
  );
}
