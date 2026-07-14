import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Comercios, ComerciosPorTelefono } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function SeleccionarNegocioScreen({ route, navigation }) {
  const { telefono } = route.params || {};
  const [comercios, setComercios] = useState([]);

  useEffect(() => {
    cargar();
  }, [telefono]);

  async function cargar() {
    try {
      const lista = telefono
        ? await ComerciosPorTelefono.listar(telefono)
        : await Comercios.listar(); // sin teléfono (ej. "Cambiar de negocio" desde Perfil): muestra todos
      setComercios(lista);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>compi</Text>
      <Text style={styles.titulo}>¿Cuál es tu negocio?</Text>
      <Text style={styles.subtitulo}>Elige tu tienda para continuar</Text>

      <FlatList
        data={[...comercios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ marginTop: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => navigation.replace('Home', { comercioId: item.id, comercioNombre: item.nombre })}
          >
            <Text style={styles.itemNombre}>{item.nombre}</Text>
            <Text style={styles.itemSub}>{item.barrio || 'Sin barrio'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>No hay negocios para mostrar</Text>}
      />

      <TouchableOpacity
        style={styles.botonNuevo}
        onPress={() => navigation.navigate('RegistroNegocio', { telefono: telefono || '' })}
      >
        <Text style={styles.botonNuevoTexto}>+ Registrar otro negocio</Text>
      </TouchableOpacity>
    </View>
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
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  botonNuevo: { marginTop: 10, height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonNuevoTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
});