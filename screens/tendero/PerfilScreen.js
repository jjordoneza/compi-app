import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS } from '../../theme';

export default function PerfilScreen({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Perfil</Text>
      <Text style={styles.subtitulo}>{comercioNombre}</Text>

      <TouchableOpacity style={styles.boton} onPress={() => navigation.navigate('SeleccionarNegocio')}>
        <Text style={styles.botonTexto}>Cambiar de negocio</Text>
      </TouchableOpacity>

      <View style={styles.divisorLinea} />
      <Text style={styles.divisorTitulo}>Herramientas de administración</Text>
      <Text style={styles.aviso}>Esto no lo ve un tendero real — es tu panel mientras construimos el sistema.</Text>

      <View style={styles.grupoAdmin}>
        <Text style={styles.grupoLabel}>Catálogo y negocios</Text>
        <TouchableOpacity style={styles.botonAdmin} onPress={() => navigation.navigate('MiNegocio')}>
          <Text style={styles.botonAdminTexto}>Mis negocios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botonAdmin, { marginTop: 8 }]} onPress={() => navigation.navigate('CatalogoMaestro')}>
          <Text style={styles.botonAdminTexto}>Catálogo Maestro</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonAdmin, { marginTop: 8 }]}
          onPress={() => navigation.navigate('Relaciones', { comercioId, comercioNombre })}
        >
          <Text style={styles.botonAdminTexto}>Editar proveedores y precios</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grupoAdmin}>
        <Text style={styles.grupoLabel}>Operación</Text>
        <TouchableOpacity style={styles.botonAdmin} onPress={() => navigation.navigate('PedidosAdmin')}>
          <Text style={styles.botonAdminTexto}>Pedidos de todos los negocios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.botonAdmin, { marginTop: 8 }]} onPress={() => navigation.navigate('SugerenciasCambio')}>
          <Text style={styles.botonAdminTexto}>Sugerencias de cambio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 60 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  boton: { height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
  divisorLinea: { height: 1, backgroundColor: COLORS.borderLight, marginTop: 30, marginBottom: 10 },
  divisorTitulo: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  aviso: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16, fontStyle: 'italic' },
  grupoAdmin: { backgroundColor: '#F1EFE8', borderRadius: RADIUS.md, padding: 12, marginBottom: 16 },
  grupoLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  botonAdmin: { height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  botonAdminTexto: { color: COLORS.text, fontWeight: '500', fontSize: 13 },
});