import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { ReabastecimientoAjustes, ReabastecimientoSugerencias } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

const MOTIVOS = ['Ya tenía inventario', 'Lo compré por otro medio'];

export default function ReabastecimientoRespuestaScreen({ route, navigation }) {
  const { comercioId, comercioNombre, productoId, productoNombre, promedioIntervalo, sugerenciaId } = route.params;
  const [guardando, setGuardando] = useState(false);

  async function guardarYVolver(motivo) {
    setGuardando(true);
    try {
      const noSugerirAntesDe = new Date();
      noSugerirAntesDe.setDate(noSugerirAntesDe.getDate() + promedioIntervalo);

      const ajusteCreado = await ReabastecimientoAjustes.crear({
        comercio_id: comercioId,
        producto_id: productoId,
        no_sugerir_antes_de: noSugerirAntesDe.toISOString(),
        motivo: motivo || null,
        sugerencia_id: sugerenciaId || null,
      });

      // Instrumentación (PR-B): cierra el lazo de la sugerencia con su respuesta.
      if (sugerenciaId) {
        await ReabastecimientoSugerencias.actualizar(sugerenciaId, {
          respuesta: 'pospuesta',
          respondida_en: new Date().toISOString(),
          ajuste_id: ajusteCreado?.[0]?.id || null,
        });
      }

      navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] });
    } catch (e) {
      Alert.alert('Error guardando', e.message);
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.check}>
        <Text style={styles.checkTexto}>✓</Text>
      </View>
      <Text style={styles.titulo}>Anotado, gracias</Text>
      <Text style={styles.subtitulo}>No te volveremos a sugerir {productoNombre} tan pronto.</Text>

      <Text style={styles.label}>¿Qué pasó? (opcional)</Text>
      <View style={styles.chipsContainer}>
        {MOTIVOS.map((m) => (
          <TouchableOpacity key={m} style={styles.chip} disabled={guardando} onPress={() => guardarYVolver(m)}>
            <Text style={styles.chipTexto}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.omitirBoton} disabled={guardando} onPress={() => guardarYVolver(null)}>
        <Text style={styles.omitirTexto}>{guardando ? 'Guardando...' : 'Omitir'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' },
  checkTexto: { fontSize: 28, color: COLORS.success, fontWeight: '700' },
  titulo: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  label: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginTop: 28, marginBottom: 10, alignSelf: 'flex-start' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'flex-start' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipTexto: { fontSize: 12, color: COLORS.text },
  omitirBoton: { marginTop: 28, padding: 10 },
  omitirTexto: { fontSize: 14, color: COLORS.textSecondary },
});