import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch, Alert } from 'react-native';
import { ProductosMaestro, ProductosRelacionExt, RelacionesExt } from '../supabase';
import { COLORS, RADIUS, formatMoney } from '../theme';

function limpiarNumero(texto) {
  const soloDigitos = texto.replace(/[^0-9]/g, '');
  return soloDigitos ? parseInt(soloDigitos, 10) : null;
}

export default function RelacionDetalleScreen({ route }) {
  const { relacionId, proveedorNombre } = route.params;
  const [productosRelacion, setProductosRelacion] = useState([]);
  const [productosMaestro, setProductosMaestro] = useState([]);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');

  const [productoAgregando, setProductoAgregando] = useState(null);
  const [precioNuevo, setPrecioNuevo] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [precioEditado, setPrecioEditado] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [contactoNombre, setContactoNombre] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [telefonoContacto2, setTelefonoContacto2] = useState('');
  const [direccionLocal, setDireccionLocal] = useState('');
  const [entregaEnTienda, setEntregaEnTienda] = useState(true);
  const [diasPedido, setDiasPedido] = useState('');
  const [minimoPedido, setMinimoPedido] = useState('');
  const [mostrarDatos, setMostrarDatos] = useState(false);

  async function cargarInicial() {
    try {
      const [prodRel, prodMaestro, relacion] = await Promise.all([
        ProductosRelacionExt.listarPorRelacion(relacionId),
        ProductosMaestro.listar(),
        RelacionesExt.obtenerPorId(relacionId),
      ]);
      setProductosRelacion(prodRel);
      setProductosMaestro(prodMaestro);
      if (relacion) {
        setContactoNombre(relacion.contacto_nombre || '');
        setTelefonoContacto(relacion.telefono_contacto || '');
        setTelefonoContacto2(relacion.telefono_contacto_2 || '');
        setDireccionLocal(relacion.direccion_entrega || '');
        setEntregaEnTienda(relacion.entrega_en_tienda ?? true);
        setDiasPedido(relacion.dias_pedido || '');
        setMinimoPedido(relacion.minimo_pedido != null ? String(relacion.minimo_pedido) : '');
      }
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  useEffect(() => { cargarInicial(); }, []);

  async function guardarDatosContacto() {
    try {
      await RelacionesExt.actualizar(relacionId, {
        contacto_nombre: contactoNombre,
        telefono_contacto: telefonoContacto,
        telefono_contacto_2: telefonoContacto2,
        direccion_entrega: direccionLocal,
        entrega_en_tienda: entregaEnTienda,
        dias_pedido: diasPedido,
        minimo_pedido: limpiarNumero(minimoPedido),
      });
      setMostrarDatos(false);
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    }
  }

  function empezarAgregar(producto) {
    setProductoAgregando(productoAgregando === producto.id ? null : producto.id);
    setPrecioNuevo('');
  }

  async function confirmarAgregar(producto) {
    if (guardandoNuevo) return;
    setGuardandoNuevo(true);
    try {
      const creado = await ProductosRelacionExt.crear({
        relacion_id: relacionId,
        producto_id: producto.id,
        precio_pactado: limpiarNumero(precioNuevo),
      });
      // Actualiza en memoria: agrega la nueva fila sin recargar todo
      setProductosRelacion((prev) => [...prev, creado[0]]);
      setProductoAgregando(null);
      setPrecioNuevo('');
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setGuardandoNuevo(false);
    }
  }

  function empezarEdicionPrecio(item) {
    setEditandoId(item.id);
    setPrecioEditado(item.precio_pactado != null ? String(item.precio_pactado) : '');
  }

  function confirmarGuardarPrecio(item) {
    Alert.alert('Confirmar cambio', '¿Guardar el nuevo precio?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: () => guardarPrecio(item) },
    ]);
  }

  async function guardarPrecio(item) {
    if (guardando) return;
    setGuardando(true);
    try {
      const nuevoPrecio = limpiarNumero(precioEditado);
      await ProductosRelacionExt.actualizar(item.id, { precio_pactado: nuevoPrecio });
      // Actualiza solo esa fila en memoria, sin recargar ni mover el scroll
      setProductosRelacion((prev) =>
        prev.map((pr) => (pr.id === item.id ? { ...pr, precio_pactado: nuevoPrecio } : pr))
      );
      setEditandoId(null);
    } catch (e) {
      Alert.alert('Error actualizando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  function confirmarEliminar(item, prod) {
    Alert.alert(
      'Quitar producto',
      `¿Quitar "${prod?.nombre || 'este producto'}" de lo que vende ${proveedorNombre}? El producto sigue existiendo en el catálogo general, solo se desvincula de este proveedor.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => eliminarVinculo(item.id) },
      ]
    );
  }

  async function eliminarVinculo(id) {
    try {
      await ProductosRelacionExt.eliminar(id);
      setProductosRelacion((prev) => prev.filter((pr) => pr.id !== id));
    } catch (e) {
      Alert.alert('Error quitando', e.message);
    }
  }

  const idsYaAgregados = productosRelacion.map((pr) => pr.producto_id);
  const disponibles = productosMaestro
    .filter((p) => !idsYaAgregados.includes(p.id))
    .filter((p) => p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const conPrecio = productosRelacion.filter((p) => p.precio_pactado != null).length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.titulo}>{proveedorNombre}</Text>
        <Text style={styles.subtitulo}>Datos específicos de este proveedor para este negocio</Text>

        <TouchableOpacity style={styles.acordeon} onPress={() => setMostrarDatos(!mostrarDatos)}>
          <Text style={styles.acordeonTexto}>{mostrarDatos ? 'Ocultar' : 'Ver / editar'} datos de contacto y condiciones</Text>
        </TouchableOpacity>

        {mostrarDatos && (
          <View style={styles.card}>
            <Text style={styles.label}>Nombre del contacto (dueño/administrador)</Text>
            <TextInput style={styles.input} placeholder="Ej. Karen Suárez" value={contactoNombre} onChangeText={setContactoNombre} />
            <Text style={styles.label}>Teléfono contacto 1</Text>
            <TextInput style={styles.input} placeholder="300 000 0000" keyboardType="phone-pad" value={telefonoContacto} onChangeText={setTelefonoContacto} />
            <Text style={styles.label}>Teléfono contacto 2 (opcional)</Text>
            <TextInput style={styles.input} placeholder="300 000 0000" keyboardType="phone-pad" value={telefonoContacto2} onChangeText={setTelefonoContacto2} />
            <Text style={styles.label}>Dirección del local del proveedor</Text>
            <TextInput style={styles.input} placeholder="Cra 45 #12-30" value={direccionLocal} onChangeText={setDireccionLocal} />
            <View style={styles.filaSwitch}>
              <Text style={styles.label}>Entrega en tu tienda</Text>
              <Switch value={entregaEnTienda} onValueChange={setEntregaEnTienda} trackColor={{ true: COLORS.primary }} />
            </View>
            <Text style={styles.label}>Días de pedido</Text>
            <TextInput style={styles.input} placeholder="Ej. Lunes y jueves" value={diasPedido} onChangeText={setDiasPedido} />
            <Text style={styles.label}>Pedido mínimo ($)</Text>
            <TextInput style={styles.input} placeholder="Ej. 30000" keyboardType="numeric" value={minimoPedido} onChangeText={setMinimoPedido} />
            <TouchableOpacity style={styles.boton} onPress={guardarDatosContacto}>
              <Text style={styles.botonTexto}>Guardar datos</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.subtitulo, { marginTop: 18 }]}>Productos de este proveedor</Text>
        <Text style={styles.ayuda}>Para corregir el nombre o la presentación de un producto (ej. "Canasta"), hazlo desde el Catálogo Maestro — es un dato compartido con todas las tiendas y proveedores que lo usan.</Text>

        {[...productosRelacion].sort((a, b) => {
          const nombreA = productosMaestro.find((p) => p.id === a.producto_id)?.nombre || '';
          const nombreB = productosMaestro.find((p) => p.id === b.producto_id)?.nombre || '';
          return nombreA.localeCompare(nombreB, 'es');
        }).map((item) => {
          const prod = productosMaestro.find((p) => p.id === item.producto_id);
          const enEdicion = editandoId === item.id;
          const sinPrecioItem = item.precio_pactado == null;

          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.filaTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre}>{prod?.nombre || 'Producto'}</Text>
                  <Text style={styles.itemSub}>{prod?.presentacion}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmarEliminar(item, prod)}>
                  <Text style={styles.eliminarTexto}>Eliminar</Text>
                </TouchableOpacity>
              </View>

              {sinPrecioItem && !enEdicion && (
                <View style={styles.avisoPrecio}>
                  <Text style={styles.avisoPrecioTexto}>Aún no me has dicho cuánto te cobra este proveedor. ¿Le ponemos el precio?</Text>
                </View>
              )}

              {enEdicion ? (
                <View style={styles.filaEdicion}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    keyboardType="numeric"
                    placeholder="Sin definir"
                    value={precioEditado}
                    onChangeText={setPrecioEditado}
                  />
                  <TouchableOpacity style={styles.botonMini} disabled={guardando} onPress={() => confirmarGuardarPrecio(item)}>
                    <Text style={styles.botonMiniTexto}>{guardando ? 'Guardando...' : 'Guardar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setEditandoId(null)}>
                    <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                  <TouchableOpacity onPress={() => empezarEdicionPrecio(item)}>
                    <Text style={styles.precioTocable}>
                      {sinPrecioItem ? 'Poner precio' : `$${formatMoney(item.precio_pactado)} · editar`}
                    </Text>
                  </TouchableOpacity>
              )}
            </View>
          );
        })}
        {productosRelacion.length === 0 && <Text style={styles.vacio}>Aún no hay productos para este proveedor</Text>}

        {productosRelacion.length > 0 && (
          <View style={styles.totalBox}>
            <Text style={styles.totalTexto}>{conPrecio} de {productosRelacion.length} productos con precio configurado</Text>
          </View>
        )}

        {!mostrarPicker ? (
          <TouchableOpacity style={styles.boton} onPress={() => setMostrarPicker(true)}>
            <Text style={styles.botonTexto}>+ Agregar producto</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={styles.subtitulo}>Elige un producto del catálogo general</Text>
            <TextInput
              style={styles.input}
              placeholder="Buscar producto..."
              value={busquedaProducto}
              onChangeText={setBusquedaProducto}
            />
            {disponibles.map((producto) => {
              const enEdicionNuevo = productoAgregando === producto.id;
              return (
                <View key={producto.id}>
                  <TouchableOpacity
                    style={[styles.itemPicker, enEdicionNuevo && styles.itemPickerActivo]}
                    onPress={() => empezarAgregar(producto)}
                  >
                    <Text style={styles.itemNombre}>{producto.nombre}</Text>
                    <Text style={styles.itemSub}>{producto.presentacion}</Text>
                  </TouchableOpacity>

                  {enEdicionNuevo && (
                    <View style={styles.panelNuevoPrecio}>
                      <Text style={styles.label}>Precio que {proveedorNombre} te cobra (opcional)</Text>
                      <View style={styles.filaEdicion}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          keyboardType="numeric"
                          placeholder="Ej. 13500"
                          value={precioNuevo}
                          onChangeText={setPrecioNuevo}
                        />
                        <TouchableOpacity style={styles.botonMini} disabled={guardandoNuevo} onPress={() => confirmarAgregar(producto)}>
                          <Text style={styles.botonMiniTexto}>{guardandoNuevo ? 'Guardando...' : 'Guardar'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setProductoAgregando(null)}>
                          <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {disponibles.length === 0 && <Text style={styles.vacio}>No hay productos que coincidan</Text>}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 10, marginBottom: 8 },
  ayuda: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 10, lineHeight: 15 },
  acordeon: { backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  acordeonTexto: { color: COLORS.primary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginTop: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, marginTop: 8 },
  input: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg, marginBottom: 10 },
  filaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  boton: { marginTop: 14, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  item: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eliminarTexto: { color: COLORS.error, fontSize: 12, fontWeight: '600' },
  itemPicker: { backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 0, borderWidth: 1, borderColor: COLORS.border },
  itemPickerActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  panelNuevoPrecio: { backgroundColor: COLORS.successBg, borderWidth: 1, borderColor: COLORS.primary, borderTopWidth: 0, borderBottomLeftRadius: RADIUS.md, borderBottomRightRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  precioTocable: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 8 },
  avisoPrecio: { marginTop: 8, backgroundColor: COLORS.warningBg, borderRadius: RADIUS.sm, padding: 8 },
  avisoPrecioTexto: { fontSize: 11, color: COLORS.warning, lineHeight: 15 },
  filaEdicion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 10, paddingHorizontal: 10 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
  totalBox: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 12, marginTop: 4, borderWidth: 0.5, borderColor: COLORS.borderLight },
  totalTexto: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginVertical: 14, fontSize: 13 },
});