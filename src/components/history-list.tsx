'use client';

import type { HistoryEntry } from '@/lib/history';

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

// F6 本地历史:localStorage 读写由页面层完成,这里纯展示
export function HistoryList({ items, onOpen, onRemove }: {
  items: HistoryEntry[];
  onOpen: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  if (!items.length) return <p className="hist-empty">还没有研究记录。挑一个地方开始。</p>;
  return (
    <ul className="hist-list">
      {items.map((h) => (
        <li key={h.taskId} className="hist-row">
          <button className="btn-ghost btn" style={{ padding: '4px 8px', fontWeight: 600 }} onClick={() => onOpen(h.taskId)}>
            {h.place}
          </button>
          <span className="dir">{h.direction}</span>
          <span className="when">{timeAgo(h.ts)}</span>
          <button className="hist-x" aria-label={`删除 ${h.place} 的记录`} onClick={() => onRemove(h.taskId)}>×</button>
        </li>
      ))}
    </ul>
  );
}
