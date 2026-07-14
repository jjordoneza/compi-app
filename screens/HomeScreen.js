import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { ProveedoresMaestro, RelacionesExt } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function HomeScreen({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    if (!comercioId) return setCargando(false);
    try {
      const relaciones = await RelacionesExt.listarPorComercio(comercioId);
      const todosProveedores = await ProveedoresMaestro.listar();
      const vinculados = relaciones
        .map((r) => todosProveedores.find((p) => p.id === r.proveedor_id))
        .filter(Boolean);
      setProveedores(vinculados);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [comercioId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 60 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola</Text>
          <Text style={styles.pregunta}>{comercioNombre || 'Tu negocio'}</Text>
        </View>
      </View>

      {!cargando && proveedores.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitulo}>Todavía no tienes proveedores</Text>
          <Text style={styles.emptyTexto}>Vincula proveedores para poder armar tu primer abastecimiento.</Text>
          <TouchableOpacity style={styles.heroBotonOutline} onPress={() => navigation.navigate('Relaciones', { comercioId, comercioNombre })}>
            <Text style={styles.heroBotonOutlineTexto}>Ver proveedores</Text>
          </TouchableOpacity>
        </View>
      )}

      {!cargando && proveedores.length > 0 && (
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Empezar</Text>
          <Text style={styles.heroTitulo}>Arma tu abastecimiento con {proveedores.length} proveedor(es)</Text>
          <TouchableOpacity
            style={styles.heroBoton}
            onPress={() => navigation.navigate('NuevoAbastecimiento', { comercioId, comercioNombre })}
          >
            <Text style={styles.heroBotonTexto}>Empezar pedido</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.navigate('Pedidos', { comercioId, comercioNombre })}>
        <Text style={styles.botonSecundarioTexto}>Ver mis pedidos</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.botonSecundario, { marginTop: 10 }]} onPress={() => navigation.navigate('Relaciones', { comercioId, comercioNombre })}>
        <Text style={styles.botonSecundarioTexto}>Ver / vincular proveedores</Text>
      </TouchableOpacity>

      <Text style={styles.divisor}>— Herramientas de administración —</Text>
      <TouchableOpacity style={styles.botonAdmin} onPress={() => navigation.navigate('MiNegocio')}>
        <Text style={styles.botonAdminTexto}>Mis negocios</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.botonAdmin, { marginTop: 8 }]} onPress={() => navigation.navigate('CatalogoMaestro')}>
        <Text style={styles.botonAdminTexto}>Catálogo Maestro</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saludo: { fontSize: 13, color: COLORS.textSecondary },
  pregunta: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  emptyCard: { marginTop: 20, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.borderLight },
  emptyTitulo: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emptyTexto: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  heroBotonOutline: { marginTop: 14, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm + 2, paddingVertical: 10, paddingHorizontal: 20 },
  heroBotonOutlineTexto: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  heroCard: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: 18 },
  heroLabel: { color: '#BFE3E6', fontSize: 12 },
  heroTitulo: { color: COLORS.white, fontSize: 18, fontWeight: '600', marginTop: 8, lineHeight: 24 },
  heroBoton: { marginTop: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.sm + 2, paddingVertical: 12, alignItems: 'center' },
  heroBotonTexto: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  botonSecundario: { marginTop: 16, height: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonSecundarioTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
  divisor: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginTop: 24, marginBottom: 8 },
  botonAdmin: { height: 44, borderRadius: RADIUS.md, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  botonAdminTexto: { color: COLORS.textSecondary, fontWeight: '500', fontSize: 13 },
});