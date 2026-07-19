import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComerciosExt } from '../supabase';
import { COLORS, RADIUS } from '../theme';

// Confirmación de GPS al registrar el negocio (decisión de producto, 18 jul
// 2026): siempre se muestra, solo esta vez. No dependemos de que el tendero
// "sepa sus coordenadas" — solo que reconozca visualmente su negocio en el
// mapa y, si el pin no cae exacto (ej. señal débil), lo arrastre.
export default function ConfirmarUbicacionScreen({ route, navigation }) {
  // volverAtras (usado por MiNegocioTenderoScreen al agregar ubicación a un
  // comercio existente): en vez de seguir el paso de onboarding hacia
  // ImportarContactos, regresa a donde vino. Sin este param, se mantiene el
  // comportamiento original (flujo de registro).
  const { comercioId, comercioNombre, lat, lng, volverAtras } = route.params;
  const [coords, setCoords] = useState({ latitude: lat, longitude: lng });
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  async function confirmar() {
    setGuardando(true);
    try {
      await ComerciosExt.actualizar(comercioId, { lat: coords.latitude, lng: coords.longitude });
    } catch (e) {
      // No bloquea el registro por esto — mismo criterio que la captura
      // original de GPS (silenciosa, nunca frena el flujo del tendero).
    } finally {
      if (volverAtras) {
        navigation.goBack();
      } else {
        navigation.navigate('ImportarContactos', { comercioId, comercioNombre });
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>¿Aquí está tu negocio?</Text>
        <Text style={styles.subtitulo}>Ajusta el pin arrastrándolo si no cayó en el lugar correcto.</Text>
      </View>

      <MapView
        style={styles.mapa}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
      >
        <Marker
          coordinate={coords}
          draggable
          onDragEnd={(e) => setCoords(e.nativeEvent.coordinate)}
        />
      </MapView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.5 }]} disabled={guardando} onPress={confirmar}>
          <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Confirmar ubicación'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  encabezado: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, lineHeight: 18 },
  mapa: { flex: 1 },
  footer: { padding: 16, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight },
  boton: { height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});
