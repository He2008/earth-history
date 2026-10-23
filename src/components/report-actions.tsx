'use client';

import { useState } from 'react';

// 报告操作:复制分享链接(F7)+ 满意度 👍/👎
export function ReportActions({ taskId, shareToken }: { taskId: string; shareToken: string | null }) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<1 | -1 | null>(null);

  const copyLink = async () => {
    if (!shareToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch { /* 剪贴板权限被拒时静默 */ }
  };

  const send = async (value: 1 | -1) => {
    setVote(value);
    try {
      await fetch(`/api/research/${taskId}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
    } catch { /* 本地记录意愿即可,失败不打扰 */ }
  };

  return (
    <div className="report-actions">
      {shareToken && (
        <button className="btn btn-primary btn-small" onClick={copyLink}>{copied ? '已复制' : '复制分享链接'}</button>
      )}
      <span style={{ flex: 1 }} />
      <span className="faint" style={{ fontSize: 13 }}>这份报告有用吗</span>
      <button className="btn btn-small" aria-label="满意" aria-pressed={vote === 1} disabled={vote !== null} onClick={() => send(1)} style={{ color: vote === 1 ? 'var(--status-success)' : undefined }}>👍</button>
      <button className="btn btn-small" aria-label="不满意" aria-pressed={vote === -1} disabled={vote !== null} onClick={() => send(-1)} style={{ color: vote === -1 ? 'var(--status-danger)' : undefined }}>👎</button>
    </div>
  );
}
