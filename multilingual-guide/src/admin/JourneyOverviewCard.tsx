import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import { parseJourney, type Journey } from '../services/journey';
import { journeyRoute } from '../services/optimalRoute';
import { useI18n } from '../hooks/useI18n';
import { RouteLegInfo, RouteSummary } from '../components/RouteMetrics';
import JourneyRouteMap from './JourneyRouteMap';
import { C } from '../theme/colors';

type JourneyPage = { items: unknown[]; total: number; pages: number };

/** Expands inside the existing Journeys KPI on the Admin overview. */
export default function JourneyOverviewCard({ count, token, style }: { count: number; token: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [items, setItems] = useState<Journey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void apiFetch<JourneyPage>(`/admin/journeys?page=${page}&page_size=5`, { token, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result.items.map(parseJourney));
        setPages(result.pages);
      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được hành trình.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [expanded, page, token, retry]);
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const route = useMemo(() => journeyRoute(selected?.stops ?? []), [selected?.stops]);
  const loading = () => { setBusy(true); setError(''); };
  const toggle = () => { if (!expanded) loading(); setExpanded(value => !value); };
  const changePage = (next: number) => { loading(); setPage(next); };

  return <View testID="admin-journey-overview" style={[style, expanded && s.expanded]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={t(expanded ? 'Thu gọn hành trình' : 'Mở rộng hành trình')} onPress={toggle} style={s.heading}>
      <View style={{ flex: 1 }}>
        <Text style={s.muted}>{t('Hành trình')}</Text>
        <Text style={s.metric}>{count.toLocaleString('vi-VN')}</Text>
        <Text style={s.hint}>{t('Tổng số trong cơ sở dữ liệu')}</Text>
      </View>
      <View style={s.toggle}>
        <Text style={s.toggleText}>{t(expanded ? 'Thu gọn' : 'Xem chi tiết')}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.primaryDark} />
      </View>
    </Pressable>
    {expanded && <View testID="admin-journey-details" style={s.details}>
      {busy ? <ActivityIndicator accessibilityLabel={t('Đang tải hành trình…')} color={C.primary} /> : error ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={s.error}>{t(error)}</Text><Pressable accessibilityRole="button" onPress={() => { loading(); setRetry(value => value + 1); }} style={s.button}><Text style={s.toggleText}>{t('Thử lại')}</Text></Pressable></View> : <>
        {!items.length ? <Text style={s.muted}>{t('Chưa có hành trình trong cơ sở dữ liệu.')}</Text> : <>
          <Text style={s.title}>{t('Chọn hành trình để xem quãng đường')}</Text>
          <View style={s.choices}>{items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${t('Xem hành trình')} ${item.name}`} accessibilityState={{ selected: item.id === selected?.id }} onPress={() => setSelectedId(item.id)} style={[s.choice, item.id === selected?.id && s.selected]}>
            <Text style={s.choiceTitle}>{item.name}</Text>
            <RouteSummary route={journeyRoute(item.stops)} compact />
          </Pressable>)}</View>
          {selected && <View testID="admin-journey-selected" style={{ gap: 14 }}>
            <Text accessibilityRole="header" style={s.title}>{selected.name}</Text>
            {!!selected.description && <Text style={s.muted}>{selected.description}</Text>}
            <RouteSummary route={route} />
            {route ? <JourneyRouteMap route={route} /> : <Text style={s.muted}>{t('Hành trình chưa có điểm dừng.')}</Text>}
            {selected.unavailable > 0 && <Text style={s.muted}>{t('Một số điểm dừng không có tọa độ hợp lệ nên chưa được tính quãng đường.')}</Text>}
            {route?.legs.map((leg, index) => <View key={leg.place.id} style={s.stop}>
              <Text style={s.choiceTitle}>{index + 1}. {leg.place.title}</Text>
              <RouteLegInfo route={route} index={index} />
            </View>)}
          </View>}
        </>}
        {pages > 1 && <View style={s.pagination}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Trang hành trình trước')} disabled={page <= 1} onPress={() => changePage(page - 1)} style={[s.button, page <= 1 && s.disabled]}><Text style={s.toggleText}>{t('← Trước')}</Text></Pressable>
          <Text style={s.muted}>{page}/{pages}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Trang hành trình sau')} disabled={page >= pages} onPress={() => changePage(page + 1)} style={[s.button, page >= pages && s.disabled]}><Text style={s.toggleText}>{t('Sau →')}</Text></Pressable>
        </View>}
      </>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  expanded: { flexBasis: '100%', minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 100 },
  metric: { fontSize: 34, fontWeight: '800', color: '#15383c', marginVertical: 12 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 20 },
  hint: { color: '#758890', fontSize: 11 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleText: { color: C.primaryDark, fontSize: 12, fontWeight: '700' },
  details: { gap: 16, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: C.border },
  title: { color: C.ink, fontSize: 16, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 5, flexGrow: 1, flexShrink: 1 },
  selected: { borderColor: C.primary, backgroundColor: C.primarySoft },
  choiceTitle: { color: C.ink, fontSize: 13, fontWeight: '700' },
  stop: { paddingTop: 10, borderTopWidth: 1, borderColor: C.border, gap: 5 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  button: { padding: 12, minHeight: 44, borderRadius: 8, backgroundColor: C.primarySoft, alignSelf: 'flex-start' },
  disabled: { opacity: .4 },
  error: { color: C.danger, fontSize: 13, lineHeight: 20 },
});
