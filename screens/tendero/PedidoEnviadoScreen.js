import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS } from '../../theme';

export default function PedidoEnviadoScreen({ route, navigation }) {
  const { comercioId, comercioNombre, abastecimientoId } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.check}>
        <Text style={styles.checkTexto}>✓</Text>
      </View>
      <Text style={styles.titulo}>Pedido enviado</Text>
      <Text style={styles.subtitulo}>Tu solicitud ya va en camino a tus proveedores. Te avisaremos apenas confirmen.</Text>

      <TouchableOpacity
        style={styles.boton}
        onPress={() => navigation.replace('Seguimiento', { comercioId, comercioNombre, abastecimientoId })}
      >
        <Text style={styles.botonTexto}>Ver seguimiento</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.botonSecundario}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] })}
      >
        <Text style={styles.botonSecundarioTexto}>Volver al inicio</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' },
  checkTexto: { fontSize: 40, color: COLORS.success, fontWeight: '700' },
  titulo: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 20 },
  subtitulo: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  boton: { marginTop: 26, width: '100%', height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  botonSecundario: { marginTop: 12, width: '100%', height: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
});