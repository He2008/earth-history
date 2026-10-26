'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MlMap, Marker, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GLOBE } from '@/lib/map-tokens';

// F1 3D 卫星地球:天地图影像 + 中文注记双层,空闲自转,交互即停;点击返回经纬度
export function Globe({ tdtKey, onPick, busy }: {
  tdtKey: string;
  onPick: (lat: number, lng: number) => void;
  busy?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const tiles = (layer: 'img' | 'cia') =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        `https://t${i}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tdtKey}`);

    const map = new MlMap({
      container: holder.current,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          'tdt-img': { type: 'raster', tiles: tiles('img'), tileSize: 256, maxzoom: 18 },
          'tdt-cia': { type: 'raster', tiles: tiles('cia'), tileSize: 256, maxzoom: 18 },
        },
        layers: [
          { id: 'space', type: 'background', paint: { 'background-color': GLOBE.space } },
          { id: 'satellite', type: 'raster', source: 'tdt-img' },
          { id: 'labels', type: 'raster', source: 'tdt-cia' },
        ],
      },
      center: [104.5, 34.2],
      zoom: 2.8,
      minZoom: 1.6,
      maxZoom: 12,
      attributionControl: { compact: true, customAttribution: '影像 · 注记 © 天地图' },
    });
    mapRef.current = map;
    map.on('load', () => setReady(true));

    // 空闲自转(手动交互即停;reduced-motion 不转)
    let spin = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stopSpin = () => { if (spin) { cancelAnimationFrame(spin); spin = 0; } };
    if (!reduced) {
      const step = () => {
        map.rotateTo(map.getBearing() + 0.035, { duration: 40 });
        spin = requestAnimationFrame(step);
      };
      const start = () => { if (!spin) spin = requestAnimationFrame(step); };
      map.once('load', start);
      const canvas = map.getCanvas();
      canvas.addEventListener('pointerdown', stopSpin, { passive: true });
      canvas.addEventListener('wheel', stopSpin, { passive: true });
    }

    map.on('click', (e: MapMouseEvent) => {
      stopSpin();
      const { lat, lng } = e.lngLat;
      if (!markerRef.current) {
        markerRef.current = new Marker({ color: GLOBE.marker }).setLngLat([lng, lat]).addTo(map);
      } else {
        markerRef.current.setLngLat([lng, lat]);
      }
      onPickRef.current(lat, lng);
    });

    return () => { stopSpin(); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [tdtKey]);

  return (
    <div className="globe-wrap" aria-label="卫星地球,点击选择地点">
      <div ref={holder} className="globe-canvas" />
      {!ready && <div className="globe-boot mono">正在接入卫星影像…</div>}
      {busy && <div className="globe-busy mono">定位中…</div>}
    </div>
  );
}
