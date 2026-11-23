import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { formatRouteDistance, routeSegments, type OptimalRoute } from '../services/optimalRoute';
import { useI18n } from '../hooks/useI18n';
import { C } from '../theme/colors';

export default function JourneyRouteMap({ route }: { route: OptimalRoute }) {
  const { t } = useI18n();
  const stops = route.legs.map(leg => leg.place);
  return <View style={{ gap: 8 }}>
    <MapView key={stops.map(place => place.id).join(',')} style={{ height: 320, borderRadius: 12 }} scrollEnabled={false} initialRegion={{ ...route.start, latitudeDelta: Math.max(.01, ...stops.map(p => Math.abs(p.latitude - route.start.latitude) * 2.5)), longitudeDelta: Math.max(.01, ...stops.map(p => Math.abs(p.longitude - route.start.longitude) * 2.5)) }}>
      {stops.length > 1 && <Polyline coordinates={stops} strokeColor={C.primaryDark} strokeWidth={3} lineDashPattern={[7, 6]} />}
      {routeSegments(route).map(leg => <Marker key={`weight-${leg.index}`} coordinate={leg.midpoint} anchor={{ x: 0, y: .5 }} tappable={false}><View style={s.weight}><Text style={s.weightText}>≈ {formatRouteDistance(leg.legKm)}</Text></View></Marker>)}
      {stops.map((place, index) => <Marker key={place.id} coordinate={place} title={`${index + 1}. ${place.title}`}><View style={s.stop}><Text style={s.number}>{index + 1}</Text></View></Marker>)}
    </MapView>
    <Text style={s.note}>{t('Đường nối minh họa, không phải tuyến đường thực tế.')}</Text>
  </View>;
}
const s = StyleSheet.create({
  weight: { backgroundColor: '#FFFFFFEE', borderWidth: 1, borderColor: '#B4D5CF', borderRadius: 8, padding: 5 },
  weightText: { color: C.primaryDark, fontWeight: '800', fontSize: 11 },
  stop: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: '#fff', backgroundColor: C.darkBlue, justifyContent: 'center', alignItems: 'center' },
  number: { color: '#fff', fontWeight: '800' },
  note: { color: C.muted, fontSize: 11, lineHeight: 17 },
});
