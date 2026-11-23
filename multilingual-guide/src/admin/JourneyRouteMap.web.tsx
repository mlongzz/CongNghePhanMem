import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import 'leaflet/dist/leaflet.css';
import './JourneyRouteMap.web.css';
import { formatRouteDistance, routeSegments, type OptimalRoute } from '../services/optimalRoute';
import { mapTileSources } from '../services/mapTiles';
import { useI18n } from '../hooks/useI18n';
import { C } from '../theme/colors';

export default function JourneyRouteMap({ route }: { route: OptimalRoute }) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      setError('');
      const map = L.map(container.current, { scrollWheelZoom: false });
      const points = route.legs.map(leg => [leg.place.latitude, leg.place.longitude] as [number, number]);
      map.fitBounds(L.latLngBounds(points), { padding: [65, 45], maxZoom: 16 });
      const segments = routeSegments(route);
      if (points.length > 1) L.polyline(points, { color: C.primaryDark, weight: 3, dashArray: '7 6' }).addTo(map);
      segments.forEach(leg => {
        const label = document.createElement('span');
        label.textContent = `≈ ${formatRouteDistance(leg.legKm)}`;
        label.dataset.legKm = String(leg.legKm);
        label.setAttribute('aria-label', `${t('Quãng đường chặng')} ${leg.index} → ${leg.index + 1}: ${label.textContent}`);
        const a = map.latLngToLayerPoint([leg.from.latitude, leg.from.longitude]);
        const b = map.latLngToLayerPoint([leg.place.latitude, leg.place.longitude]);
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // Place the weight beside the segment so it cannot cover a numbered stop.
        const offset: [number, number] = [-(b.y - a.y) / length * 52, (b.x - a.x) / length * 52];
        L.tooltip({ permanent: true, direction: 'center', opacity: 1, className: 'admin-journey-weight', offset })
          .setLatLng([leg.midpoint.latitude, leg.midpoint.longitude]).setContent(label).addTo(map);
      });
      route.legs.forEach((leg, index) => {
        const number = document.createElement('span');
        number.textContent = String(index + 1);
        const title = document.createElement('span');
        title.textContent = `${index + 1}. ${leg.place.title}`;
        L.marker([leg.place.latitude, leg.place.longitude], { icon: L.divIcon({ className: 'admin-journey-stop', html: number, iconSize: [32, 32], iconAnchor: [16, 16] }) })
          .bindTooltip(title).addTo(map);
      });
      const sources = mapTileSources();
      let layer: import('leaflet').TileLayer | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const showTiles = (index: number) => {
        clearTimeout(timer);
        layer?.remove();
        layer?.off();
        if (cancelled) return;
        const source = sources[index];
        const current = L.tileLayer(source.url, { maxZoom: 19, attribution: source.attribution });
        layer = current;
        let succeeded = false, switching = false;
        const fail = () => {
          if (cancelled || layer !== current || switching) return;
          switching = true;
          clearTimeout(timer);
          if (index + 1 < sources.length) timer = setTimeout(() => showTiles(index + 1), 0);
          else setError('Ảnh nền bản đồ chưa tải được. Vị trí, điểm dừng và danh sách vẫn được giữ.');
        };
        current.on('tileload', () => { if (!cancelled && layer === current) { succeeded = true; clearTimeout(timer); setError(''); } });
        current.on('load', () => { if (!succeeded) fail(); });
        timer = setTimeout(() => { if (!succeeded) fail(); }, 12_000);
        current.addTo(map);
      };
      showTiles(0);
      const observer = new ResizeObserver(() => { if (!cancelled) map.invalidateSize(); });
      observer.observe(container.current);
      dispose = () => { clearTimeout(timer); observer.disconnect(); layer?.off(); map.remove(); };
    }).catch(() => { if (!cancelled) setError('Không tải được bản đồ.'); });
    return () => { cancelled = true; dispose?.(); };
  }, [route, t]);
  return <View style={{ gap: 8 }}>
    <div ref={container} data-testid="admin-journey-map" role="region" aria-label={t('Bản đồ hành trình và quãng đường từng chặng')} style={{ height: 320, width: '100%', borderRadius: 12, overflow: 'hidden' }} />
    {error ? <Text accessibilityRole="alert" style={s.note}>{t(error)}</Text> : null}
    <Text style={s.note}>{t('Đường nối minh họa, không phải tuyến đường thực tế.')}</Text>
  </View>;
}
const s = StyleSheet.create({ note: { color: C.muted, fontSize: 11, lineHeight: 17 } });
