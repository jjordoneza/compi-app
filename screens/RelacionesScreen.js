import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, FlatList, ScrollView, Alert } from 'react-native';
import { ProveedoresMaestro, RelacionesExt } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function RelacionesScreen({ route, navigation }) {
  const { comercioId, comercioNombre } = route.params;
  const [relaciones, setRelaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState(null);

  async function cargar() {
    try {
      setRelaciones(await RelacionesExt.listarPorComercio(comercioId));
      setProveedores(await ProveedoresMaestro.listar());
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function vincularProveedor(proveedor) {
    try {
      await RelacionesExt.crear({ comercio_id: comercioId, proveedor_id: proveedor.id });
      setMostrarPicker(false);
      cargar();
    } catch (e) {
      Alert.alert('Error vinculando', e.message);
    }
  }

  const proveedoresYaVinculados = relaciones.map((r) => r.proveedor_id);
  const proveedoresDisponibles = proveedores
    .filter((p) => !proveedoresYaVinculados.includes(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const categoriasDisponibles = Array.from(
    new Set(
      relaciones
        .map((r) => proveedores.find((p) => p.id === r.proveedor_id))
        .flatMap((p) => (p?.categoria || '').split(',').map((c) => c.trim()).filter(Boolean))
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const relacionesFiltradas = relaciones
    .filter((r) => {
      const prov = proveedores.find((p) => p.id === r.proveedor_id);
      if (!prov) return false;
      const coincideNombre = prov.nombre.toLowerCase().includes(busqueda.toLowerCase());
      const categorias = (prov.categoria || '').split(',').map((c) => c.trim());
      const coincideCategoria = !categoriaFiltro || categorias.includes(categoriaFiltro);
      return coincideNombre && coincideCategoria;
    })
    .sort((a, b) => {
      const provA = proveedores.find((p) => p.id === a.proveedor_id);
      const provB = proveedores.find((p) => p.id === b.proveedor_id);
      return (provA?.nombre || '').localeCompare(provB?.nombre || '', 'es');
    });

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{comercioNombre}</Text>
      <Text style={styles.subtitulo}>Proveedores vinculados a este negocio</Text>

      <TextInput style={styles.buscador} placeholder="Buscar proveedor..." value={busqueda} onChangeText={setBusqueda} />

      {categoriasDisponibles.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtrosScroll}
          contentContainerStyle={styles.filtrosContenido}
        >
          {['Todas', ...categoriasDisponibles].map((item) => {
            const activo = item === 'Todas' ? categoriaFiltro === null : categoriaFiltro === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.chip, activo && styles.chipActivo]}
                onPress={() => setCategoriaFiltro(item === 'Todas' ? null : item)}
              >
                <Text numberOfLines={1} style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={relacionesFiltradas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const prov = proveedores.find((p) => p.id === item.proveedor_id);
          const categorias = (prov?.categoria || '').split(',').map((c) => c.trim()).filter(Boolean);
          return (
            <TouchableOpacity
              style={styles.item}
              onPress={() => navigation.navigate('RelacionDetalle', { relacionId: item.id, proveedorNombre: prov?.nombre || 'Proveedor' })}
            >
              <Text style={styles.itemNombre}>{prov?.nombre || 'Proveedor'}</Text>
              {categorias.length > 0 ? (
                <View style={styles.pillsContainer}>
                  {categorias.map((cat) => (
                    <View key={cat} style={styles.pill}>
                      <Text style={styles.pillTexto}>{cat}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.itemSub}>Sin categoría</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.vacio}>No hay proveedores que coincidan</Text>}
      />

      <TouchableOpacity style={styles.boton} onPress={() => setMostrarPicker(!mostrarPicker)}>
        <Text style={styles.botonTexto}>{mostrarPicker ? 'Cerrar' : '+ Vincular proveedor'}</Text>
      </TouchableOpacity>

      {mostrarPicker && (
        <FlatList
          style={{ marginTop: 10 }}
          data={proveedoresDisponibles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.itemPicker} onPress={() => vincularProveedor(item)}>
              <Text style={styles.itemNombre}>{item.nombre}</Text>
              <Text style={styles.itemSub}>{item.categoria || 'Sin categoría'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.vacio}>No hay más proveedores disponibles para vincular</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  buscador: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 12 },

  filtrosScroll: { flexGrow: 0, marginBottom: 14 },
  filtrosContenido: { alignItems: 'center', paddingRight: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActivo: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipTexto: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  chipTextoActivo: { color: COLORS.white, fontWeight: '700' },

  boton: { marginTop: 12, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  item: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  itemPicker: { backgroundColor: COLORS.successBg, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.primary },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.full, paddingVertical: 3, paddingHorizontal: 10 },
  pillTexto: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20, fontSize: 13 },
});