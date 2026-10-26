'use client';

import { useState } from 'react';
import { searchPlaces, type SeedPlace } from '@/lib/places';

// 选点(暂代 F1 地球:种子池检索 + 随便看看;天地图 Key 到位后换地球点击)
export function PlacePicker({ onSelect, onRandom }: { onSelect: (p: SeedPlace) => void; onRandom: () => void }) {
  const [q, setQ] = useState('');
  const trimmed = q.trim();
  const results = trimmed ? searchPlaces(trimmed) : [];

  return (
    <div className="picker">
      <input
        className="picker-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) onSelect(results[0]); }}
        placeholder="搜一个地方:敦煌、平遥、诺邓……"
        aria-label="搜索地点"
      />
      {trimmed && (
        results.length ? (
          <ul className="picker-results" role="listbox">
            {results.map((p) => (
              <li key={`${p.province}${p.county}${p.name}`} role="option" aria-selected={false}>
                <button className="picker-item" onClick={() => onSelect(p)}>
                  <span><span className="name">{p.name}</span> <span className="admin">{p.province}{p.city ?? ''}{p.county}</span></span>
                  <span className="coords mono">{p.lat.toFixed(2)}, {p.lng.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="picker-empty">种子池里没有「{trimmed}」。地球模块上线后可点任意地点。</p>
        )
      )}
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={onRandom}>随便看看</button>
      </div>
    </div>
  );
}
