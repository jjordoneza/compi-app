import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ProveedoresMaestro, ProductosMaestro } from '../supabase';
import { COLORS, RADIUS } from '../theme';

const CATEGORIAS = [
  'Huevos', 'Lácteos', 'Bebidas', 'Snacks', 'Aseo',
  'Panadería', 'Carnes', 'Granos y abarrotes', 'Cigarrería', 'Verduras y frutas',
];

export default function CatalogoMaestroScreen() {
  const [tab, setTab] = useState('proveedores');
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);

  const [nombre, setNombre] = useState('');
  const [categoriasProveedor, setCategoriasProveedor] = useState([]);
  const [categoriaProducto, setCategoriaProducto] = useState(null);
  const [presentacion, setPresentacion] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCategoriasProveedor, setEditCategoriasProveedor] = useState([]);
  const [editCategoriaProducto, setEditCategoriaProducto] = useState(null);
  const [editPresentacion, setEditPresentacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      if (tab === 'proveedores') setProveedores(await ProveedoresMaestro.listar());
      else setProductos(await ProductosMaestro.listar());
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  useEffect(() => { cargar(); setEditandoId(null); }, [tab]);

  function toggleCategoriaProveedor(cat) {
    setCategoriasProveedor((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  }
  function toggleEditCategoriaProveedor(cat) {
    setEditCategoriasProveedor((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  }

  function confirmarGuardar() {
    if (!nombre.trim()) return;
    Alert.alert('Confirmar', `¿Guardar "${nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: guardar },
    ]);
  }

  async function guardar() {
    try {
      if (tab === 'proveedores') {
        await ProveedoresMaestro.crear({ nombre, categoria: categoriasProveedor.join(', ') });
      } else {
        await ProductosMaestro.crear({ nombre, presentacion, categoria: categoriaProducto || '' });
      }
      setNombre(''); setPresentacion(''); setCategoriasProveedor([]); setCategoriaProducto(null);
      await cargar();
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    }
  }

  function empezarEdicion(item) {
    setEditandoId(item.id);
    setEditNombre(item.nombre);
    if (tab === 'proveedores') {
      setEditCategoriasProveedor((item.categoria || '').split(',').map((c) => c.trim()).filter(Boolean));
    } else {
      setEditPresentacion(item.presentacion || '');
      setEditCategoriaProducto(item.categoria || null);
    }
  }

  function confirmarGuardarEdicion() {
    Alert.alert('Confirmar cambios', `¿Guardar los cambios en "${editNombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: guardarEdicion },
    ]);
  }

  async function guardarEdicion() {
    setGuardando(true);
    try {
      if (tab === 'proveedores') {
        await ProveedoresMaestro.actualizar(editandoId, { nombre: editNombre, categoria: editCategoriasProveedor.join(', ') });
      } else {
        await ProductosMaestro.actualizar(editandoId, { nombre: editNombre, presentacion: editPresentacion, categoria: editCategoriaProducto || '' });
      }
      await cargar();
      setEditandoId(null);
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  const data = [...(tab === 'proveedores' ? proveedores : productos)].sort((a, b) =>
  a.nombre.localeCompare(b.nombre, 'es')
);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'proveedores' && styles.tabActivo]} onPress={() => setTab('proveedores')}>
            <Text style={[styles.tabTexto, tab === 'proveedores' && styles.tabTextoActivo]}>Proveedores</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'productos' && styles.tabActivo]} onPress={() => setTab('productos')}>
            <Text style={[styles.tabTexto, tab === 'productos' && styles.tabTextoActivo]}>Productos</Text>
          </TouchableOpacity>
        </View>

        {tab === 'productos' && (
          <Text style={styles.ayuda}>
            Esto crea el producto en el catálogo general de Compi (su nombre, presentación y categoría). Todavía no está a la venta por ningún proveedor específico. Para conectarlo con un proveedor y ponerle precio, ve a Mi Negocio → una tienda → un proveedor → "Agregar producto".
          </Text>
        )}

        <Text style={styles.label}>Crear nuevo</Text>
        <TextInput style={styles.input} placeholder="Nombre" value={nombre} onChangeText={setNombre} />

        {tab === 'proveedores' ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.label}>Categorías (opcional, elige las que apliquen)</Text>
            <View style={styles.chipsContainer}>
              {CATEGORIAS.map((cat) => {
                const activo = categoriasProveedor.includes(cat);
                return (
                  <TouchableOpacity key={cat} style={[styles.chip, activo && styles.chipActivo]} onPress={() => toggleCategoriaProveedor(cat)}>
                    <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{activo ? '✓ ' : ''}{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            <TextInput style={styles.input} placeholder="Presentación (ej. Canasta, Six pack)" value={presentacion} onChangeText={setPresentacion} />
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.label}>Categoría (opcional, elige una)</Text>
              <View style={styles.chipsContainer}>
                {CATEGORIAS.map((cat) => {
                  const activo = categoriaProducto === cat;
                  return (
                    <TouchableOpacity key={cat} style={[styles.chip, activo && styles.chipActivo]} onPress={() => setCategoriaProducto(activo ? null : cat)}>
                      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{activo ? '✓ ' : ''}{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        <TouchableOpacity style={styles.boton} onPress={confirmarGuardar}>
          <Text style={styles.botonTexto}>Guardar</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 20 }]}>{tab === 'proveedores' ? 'Proveedores existentes' : 'Productos existentes'}</Text>

        {data.map((item) => {
          const enEdicion = editandoId === item.id;
          return (
            <View key={item.id} style={styles.item}>
              {!enEdicion ? (
                <View style={styles.filaTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNombre}>{item.nombre}</Text>
                    <Text style={styles.itemSub}>
                      {tab === 'proveedores' ? (item.categoria || 'Sin categoría') : `${item.presentacion || ''} · ${item.categoria || 'Sin categoría'}`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => empezarEdicion(item)}>
                    <Text style={styles.editarTexto}>Editar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.label}>Nombre</Text>
                  <TextInput style={styles.input} value={editNombre} onChangeText={setEditNombre} />

                  {tab === 'proveedores' ? (
                    <>
                      <Text style={styles.label}>Categorías</Text>
                      <View style={styles.chipsContainer}>
                        {CATEGORIAS.map((cat) => {
                          const activo = editCategoriasProveedor.includes(cat);
                          return (
                            <TouchableOpacity key={cat} style={[styles.chip, activo && styles.chipActivo]} onPress={() => toggleEditCategoriaProveedor(cat)}>
                              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{activo ? '✓ ' : ''}{cat}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.label}>Presentación</Text>
                      <TextInput style={styles.input} value={editPresentacion} onChangeText={setEditPresentacion} />
                      <Text style={styles.label}>Categoría</Text>
                      <View style={styles.chipsContainer}>
                        {CATEGORIAS.map((cat) => {
                          const activo = editCategoriaProducto === cat;
                          return (
                            <TouchableOpacity key={cat} style={[styles.chip, activo && styles.chipActivo]} onPress={() => setEditCategoriaProducto(activo ? null : cat)}>
                              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{activo ? '✓ ' : ''}{cat}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <View style={styles.filaBotones}>
                    <TouchableOpacity style={styles.botonMini} disabled={guardando} onPress={confirmarGuardarEdicion}>
                      <Text style={styles.botonMiniTexto}>{guardando ? 'Guardando...' : 'Guardar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setEditandoId(null)}>
                      <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  tabActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary },
  tabTexto: { color: COLORS.textSecondary, fontSize: 13 },
  tabTextoActivo: { color: COLORS.primary, fontWeight: '600' },
  ayuda: { fontSize: 12, color: COLORS.textSecondary, backgroundColor: COLORS.white, borderRadius: RADIUS.sm, padding: 10, marginBottom: 12, lineHeight: 17 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 10 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary },
  chipTexto: { fontSize: 12, color: COLORS.textSecondary },
  chipTextoActivo: { color: COLORS.primary, fontWeight: '600' },
  boton: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  item: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editarTexto: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  filaBotones: { flexDirection: 'row', gap: 8, marginTop: 6 },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 10, paddingHorizontal: 10 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
});