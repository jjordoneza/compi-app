import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { cerrarSesion } from '../../auth';
import { useComercioActual } from '../../comercioActual';
import { COLORS, RADIUS } from '../../theme';

export default function PerfilScreen({ navigation, route }) {
  const { comercioId } = route.params || {};
  const { comercioActual } = useComercioActual();
  const comercioNombre = comercioActual?.comercioNombre ?? route.params?.comercioNombre;

  async function salir() {
    await cerrarSesion();
    const root = navigation.getParent() || navigation;
    root.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Perfil</Text>
      <Text style={styles.subtitulo}>{comercioNombre}</Text>

      <TouchableOpacity
        style={styles.boton}
        onPress={() => navigation.navigate('MiNegocioTendero', { comercioId })}
      >
        <Text style={styles.botonTexto}>Editar mi negocio</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.boton, { marginTop: 10 }]}
        onPress={() => navigation.navigate('SeleccionarNegocio')}
      >
        <Text style={styles.botonTexto}>Cambiar de negocio</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.boton, { marginTop: 10 }]} onPress={salir}>
        <Text style={styles.botonTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 60 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  boton: { height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
});