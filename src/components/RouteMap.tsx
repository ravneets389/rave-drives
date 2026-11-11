import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Sample } from '../lib/types';
import { RAMP_CSS, speedColor } from '../lib/fmt';

/** Route coloured by speed (one-hue sequential ramp: dark = slow, light = fast). */
export function RouteMap({ samples, maxKmh }: { samples: Sample[]; maxKmh: number }) {
  const pts = useMemo(() => samples.filter((s) => s.lat != null && (s.acc ?? 0) < 60), [samples]);
  const segments = useMemo(() => {
    const out: { color: string; path: [number, number][] }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const color = speedColor(pts[i].v, maxKmh);
      const a: [number, number] = [pts[i - 1].lat!, pts[i - 1].lon!];
      const b: [number, number] = [pts[i].lat!, pts[i].lon!];
      const last = out[out.length - 1];
      if (last && last.color === color) last.path.push(b);
      else out.push({ color, path: [a, b] });
    }
    return out;
  }, [pts, maxKmh]);

  if (pts.length < 2) return <div className="map row" style={{ justifyContent: 'center' }}><span className="muted">No GPS track for this drive</span></div>;
  const start: [number, number] = [pts[0].lat!, pts[0].lon!];
  const end: [number, number] = [pts[pts.length - 1].lat!, pts[pts.length - 1].lon!];

  return (
    <>
      <div className="map">
        <MapContainer center={start} zoom={14} style={{ height: '100%', width: '100%', background: '#14171c' }} attributionControl zoomControl={false}>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            className="dark-tiles" maxZoom={19}
          />
          {segments.map((s, i) => <Polyline key={i} positions={s.path} pathOptions={{ color: s.color, weight: 4, opacity: 1, lineCap: 'round' }} />)}
          <CircleMarker center={start} radius={7} pathOptions={{ color: '#0b0d10', weight: 2, fillColor: '#f2f4f7', fillOpacity: 1 }} />
          <CircleMarker center={end} radius={7} pathOptions={{ color: '#0b0d10', weight: 2, fillColor: '#ff5a1f', fillOpacity: 1 }} />
          <Fit pts={pts.map((p) => [p.lat!, p.lon!] as [number, number])} />
        </MapContainer>
      </div>
      <div className="legend">
        <span>0</span><div className="ramp" style={{ background: RAMP_CSS }} /><span>{Math.round(maxKmh)} km/h</span>
        <span style={{ marginLeft: 'auto' }}><i className="pin" style={{ background: '#f2f4f7' }} />start <i className="pin" style={{ background: '#ff5a1f', marginLeft: 8 }} />end</span>
      </div>
    </>
  );
}

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] }); }, [map, pts]);
  return null;
}
