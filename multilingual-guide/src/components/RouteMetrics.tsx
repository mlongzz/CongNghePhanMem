import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../hooks/useI18n';
import { formatRouteDistance, legWalkingMinutes, type OptimalRoute } from '../services/optimalRoute';
import { C } from '../theme/colors';

export function RouteSummary({ route, compact = false }: { route: OptimalRoute | null; compact?: boolean }) {
  const { t } = useI18n();
  if (!route) return null;
  if (compact) return <Text style={s.meta}>≈ {formatRouteDistance(route.walkingKm)} · ~{route.walkingMinutes} {t('phút đi bộ')}</Text>;
  return <View testID="route-summary" style={s.summary}>
    <View style={s.stats}>
      <View style={s.stat}><Text style={s.value}>{route.legs.length}</Text><Text style={s.label}>{t('điểm dừng')}</Text></View>
      <View style={s.stat}><Text testID="route-total-distance" style={s.value}>≈ {formatRouteDistance(route.walkingKm)}</Text><Text style={s.label}>{t('Tổng quãng đường')}</Text></View>
      <View style={s.stat}><Text testID="route-total-time" style={s.value}>~{route.walkingMinutes} {t('phút')}</Text><Text style={s.label}>{t('Thời gian đi bộ')}</Text></View>
    </View>
    <Text style={s.note}>{t('Ước tính theo đường chim bay × 1,3, tốc độ 4,5 km/h; chưa tính thời gian tham quan.')}</Text>
  </View>;
}

export function RouteLegInfo({ route, index }: { route: OptimalRoute; index: number }) {
  const { t } = useI18n();
  const leg = route.legs[index];
  if (!leg) return null;
  if (index === 0 && leg.legKm === 0) return <Text style={s.meta}>{t('Điểm xuất phát')}</Text>;
  return <View testID="route-leg-distance" style={s.leg}>
    <Text style={s.distance}>{t(index ? 'Từ điểm trước' : 'Từ điểm xuất phát')}: ≈ {formatRouteDistance(leg.legKm)} · ~{legWalkingMinutes(leg.legKm)} {t('phút')}</Text>
    <Text style={s.meta}>{t('Quãng đường cộng dồn')}: ≈ {formatRouteDistance(leg.cumulativeKm)}</Text>
  </View>;
}

const s = StyleSheet.create({
  summary: { gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flex: 1, minWidth: 85, backgroundColor: C.primarySoft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  value: { color: C.primaryDark, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  label: { color: C.primaryDark, fontSize: 11, marginTop: 3, textAlign: 'center' },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  leg: { gap: 3 },
  distance: { color: C.primaryDark, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  meta: { color: C.muted, fontSize: 12, lineHeight: 18 },
});
