'use client';

import { useEffect, useState } from 'react';
import { DIRECTIONS, type Direction } from '@/lib/types';
import { seedPlaceDisplayName, type SeedPlace } from '@/lib/places';

// F3.1 研究确认弹窗:方向预设 + 补充指令,确认后才启动(省成本 + 控制感)
// place 兼容两种来源:种子池条目 / 地球点击后的逆地理结果(subtitle 传全地址)
export function ConfirmDialog({ place, subtitle, coarse, onCancel, onConfirm }: {
  place: SeedPlace;
  subtitle?: string;
  coarse?: boolean; // LLM 区域粗定位(境外):粒度为国家/一级行政区,预期管理
  onCancel: () => void;
  onConfirm: (direction: Direction, extra: string) => void;
}) {
  const [direction, setDirection] = useState<Direction>('综合沿革');
  const [extra, setExtra] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="确认研究">
      <div className="dialog">
        <h2 className="dialog-place" style={{ fontSize: 19 }}>{place.name}</h2>
        <p className="dialog-admin">
          {subtitle ?? seedPlaceDisplayName(place).replace(place.name, '')} · {place.lat.toFixed(2)}, {place.lng.toFixed(2)}
          {coarse && <span className="coarse-tag">区域粗定位</span>}
        </p>

        <p className="dialog-label">研究方向</p>
        <div className="chip-grid">
          {DIRECTIONS.map((d) => (
            <button key={d} className="chip" aria-pressed={direction === d} onClick={() => setDirection(d)}>{d}</button>
          ))}
        </div>

        <p className="dialog-label">补充指令(可选)</p>
        <textarea
          value={extra}
          maxLength={200}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="比如:重点看盐业与马帮贸易"
          aria-label="补充指令"
        />
        <p className="faint" style={{ fontSize: 12, margin: '4px 0 0', textAlign: 'right' }}>{extra.length}/200</p>

        <div className="dialog-foot">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={() => onConfirm(direction, extra.trim())}>开始研究</button>
        </div>
      </div>
    </div>
  );
}
