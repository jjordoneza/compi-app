import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MisComercios } from '../supabase';
import { usuarioActual } from '../auth';
import { COLORS, RADIUS } from '../theme';

export default function SeleccionarNegocioScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [comercios, setComercios] = useState([]);
  const [eliminados, setEliminados] = useState([]);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    try {
      // Solo los comercios donde el usuario autenticado es miembro (RLS lo garantiza).
      const [activos, inactivos] = await Promise.all([MisComercios.listar(), MisComercios.listarInactivos()]);
      setComercios(activos);
      setEliminados(inactivos);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
      <Text style={styles.brand}>compi</Text>
      <Text style={styles.titulo}>¿Cuál es tu negocio?</Text>
      <Text style={styles.subtitulo}>Elige tu tienda para continuar</Text>

      <View style={{ marginTop: 20 }}>
        {comercios.length === 0 ? (
          <Text style={styles.vacio}>No hay negocios activos para mostrar</Text>
        ) : (
          [...comercios]
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            .map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                onPress={() => navigation.replace('Home', { comercioId: item.id, comercioNombre: item.nombre })}
              >
                <Text style={styles.itemNombre}>{item.nombre}</Text>
                <Text style={styles.itemSub}>{item.barrio || 'Sin barrio'}</Text>
              </TouchableOpacity>
            ))
        )}
      </View>

      <TouchableOpacity
        style={styles.botonNuevo}
        onPress={() => navigation.navigate('RegistroNegocio', { telefono: usuarioActual()?.phone || '' })}
      >
        <Text style={styles.botonNuevoTexto}>+ Registrar otro negocio</Text>
      </TouchableOpacity>

      {eliminados.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <Text style={styles.seccionTitulo}>Negocios eliminados</Text>
          <Text style={styles.seccionSubtitulo}>Puedes revisar su historial o volver a activarlos.</Text>
          {[...eliminados]
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            .map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemEliminado}
                onPress={() => navigation.navigate('HistorialNegocioEliminado', { comercioId: item.id, comercioNombre: item.nombre })}
              >
                <Text style={styles.itemNombreEliminado}>{item.nombre}</Text>
                <Text style={styles.itemSub}>{item.barrio || 'Sin barrio'}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, paddingTop: 70, paddingHorizontal: 26 },
  brand: { fontSize: 18, fontWeight: '600', color: COLORS.primary, marginBottom: 20 },
  titulo: { fontSize: 22, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
  item: { backgroundColor: COLORS.bg, padding: 16, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  itemNombre: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 10, marginBottom: 10 },
  botonNuevo: { marginTop: 10, height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonNuevoTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
  seccionTitulo: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  seccionSubtitulo: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  itemEliminado: { backgroundColor: COLORS.bg, padding: 16, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight, opacity: 0.75 },
  itemNombreEliminado: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
});
