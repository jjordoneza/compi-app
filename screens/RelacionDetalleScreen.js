import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductosMaestro, ProductosRelacionExt, RelacionesExt, PedidosExt, PedidoItemsExt, AbastecimientosExt, ProveedoresMaestroExt } from '../supabase';
import { COLORS, RADIUS, formatMoney, textoPrecioUnitario } from '../theme';
import { UMBRAL_PRECIO_VIEJO_DIAS } from '../constants';

function limpiarNumero(texto) {
  const soloDigitos = texto.replace(/[^0-9]/g, '');
  return soloDigitos ? parseInt(soloDigitos, 10) : null;
}

function precioViejo(precioActualizadoEn) {
  if (!precioActualizadoEn) return false;
  const dias = (Date.now() - new Date(precioActualizadoEn).getTime()) / 86400000;
  return dias > UMBRAL_PRECIO_VIEJO_DIAS;
}

// Chips de una sola selección (tap de nuevo para deseleccionar) — mismo
// patrón que ya usa apps/admin-web para categoría de producto.
function ChipsFiltro({ opciones, valor, onCambiar }) {
  if (opciones.length === 0) return null;
  return (
    <View style={styles.chipsFila}>
      {opciones.map((op) => {
        const activo = valor === op;
        return (
          <TouchableOpacity
            key={op}
            style={[styles.chip, activo && styles.chipActivo]}
            onPress={() => onCambiar(activo ? null : op)}
          >
            <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{op}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Memoizado: al marcar una casilla, solo esta fila debe re-renderizar, no las
// ~cientos del catálogo compartido completo. Depende de que el padre le pase
// `onToggle` con identidad estable (useCallback) — si no, el memo no sirve de nada.
const FilaPicker = memo(function FilaPicker({ producto, activo, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.itemPicker, activo && styles.itemPickerActivo]}
      onPress={() => onToggle(producto.id)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.itemNombre}>{producto.nombre}</Text>
        <Text style={styles.itemSub}>{producto.presentacion}</Text>
      </View>
      <View style={[styles.check, activo && styles.checkActivo]}>
        {activo && <Text style={styles.checkTexto}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
});

export default function RelacionDetalleScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { relacionId, proveedorNombre } = route.params;
  const [productosRelacion, setProductosRelacion] = useState([]);
  const [productosMaestro, setProductosMaestro] = useState([]);
  const [relacionInfo, setRelacionInfo] = useState(null);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState(null);
  const [marcaFiltro, setMarcaFiltro] = useState(null);
  const [seleccionados, setSeleccionados] = useState([]); // producto_id[] marcados en el picker
  const [agregandoVarios, setAgregandoVarios] = useState(false);
  const [alturaFooterAgregar, setAlturaFooterAgregar] = useState(0);

  const [editandoId, setEditandoId] = useState(null);
  const [precioEditado, setPrecioEditado] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Decisión de producto (18 jul 2026): contacto_nombre, telefono_contacto_2
  // y direccion_entrega dejan de ser editables — se muestran de solo lectura
  // con el valor que ya tuvieran (nadie los vuelve a cambiar desde aquí). El
  // teléfono deja de leer relacion.telefono_contacto (eso sigue siendo "Mi
  // contacto con este proveedor" en ProveedoresTabScreen, sin tocar) y pasa a
  // mostrar el número oficial de proveedores_maestro.
  const [direccionLocal, setDireccionLocal] = useState('');
  const [proveedorMaestro, setProveedorMaestro] = useState(null);
  const [entregaEnTienda, setEntregaEnTienda] = useState(true);
  const [diasPedido, setDiasPedido] = useState('');
  const [minimoPedido, setMinimoPedido] = useState('');
  const [aceptaCredito, setAceptaCredito] = useState(false);
  const [mostrarDatos, setMostrarDatos] = useState(false);

  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [historial, setHistorial] = useState(null); // null = todavía no cargado
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  async function cargarInicial() {
    try {
      const [prodRel, prodMaestro, relacion] = await Promise.all([
        ProductosRelacionExt.listarPorRelacion(relacionId),
        ProductosMaestro.listar(),
        RelacionesExt.obtenerPorId(relacionId),
      ]);
      setProductosRelacion(prodRel);
      setProductosMaestro(prodMaestro);
      setRelacionInfo(relacion);
      if (relacion) {
        setDireccionLocal(relacion.direccion_entrega || '');
        setEntregaEnTienda(relacion.entrega_en_tienda ?? true);
        setDiasPedido(relacion.dias_pedido || '');
        setMinimoPedido(relacion.minimo_pedido != null ? String(relacion.minimo_pedido) : '');
        setAceptaCredito(relacion.acepta_credito ?? false);
        if (relacion.proveedor_id) {
          ProveedoresMaestroExt.obtenerPorId(relacion.proveedor_id).then(setProveedorMaestro);
        }
      }
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  useEffect(() => {
    // "focus", no solo mount: precios/productos editados desde otra sesión (o
    // vía Catálogo Maestro) deben verse al volver a esta pantalla sin remontar.
    const unsubscribe = navigation.addListener('focus', cargarInicial);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // Solo estos 4 quedan editables por el tendero — el resto de la pantalla
  // (contacto, teléfono, dirección de entrega, ubicación del proveedor) es
  // de solo lectura, fijada por el admin en Maestro de proveedores.
  async function guardarDatosContacto() {
    try {
      await RelacionesExt.actualizar(relacionId, {
        entrega_en_tienda: entregaEnTienda,
        dias_pedido: diasPedido,
        minimo_pedido: limpiarNumero(minimoPedido),
        acepta_credito: aceptaCredito,
      });
      setMostrarDatos(false);
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    }
  }

  // Carga perezosa (solo al abrir el acordeón la primera vez): el precio mostrado
  // es el precio_pactado ACTUAL de cada producto, no una foto histórica — pedido_items
  // no guarda un precio propio, así que si el precio cambió después de ese pedido,
  // el total de un pedido viejo aquí puede no coincidir con lo que se pagó entonces.
  // Es la misma limitación que ya tienen Inicio y Pedidos con el historial.
  async function toggleHistorial() {
    const abrir = !mostrarHistorial;
    setMostrarHistorial(abrir);
    if (abrir && historial === null) {
      setCargandoHistorial(true);
      try {
        const pedidos = await PedidosExt.listarPorRelacion(relacionId);
        const idsAbastecimientos = [...new Set(pedidos.map((p) => p.abastecimiento_id))];
        const [abastecimientos, itemsPorPedido] = await Promise.all([
          AbastecimientosExt.listarPorIds(idsAbastecimientos),
          Promise.all(pedidos.map((p) => PedidoItemsExt.listarPorPedido(p.id))),
        ]);

        const armado = pedidos
          .map((pedido, i) => {
            const ab = abastecimientos.find((a) => a.id === pedido.abastecimiento_id);
            let totalCompleto = true;
            const items = itemsPorPedido[i].map((it) => {
              const pr = productosRelacion.find((x) => x.id === it.producto_relacion_id);
              const prod = pr ? productosMaestro.find((p) => p.id === pr.producto_id) : null;
              if (!pr || pr.precio_pactado == null) totalCompleto = false;
              return { nombre: prod?.nombre || 'Producto', cantidad: it.cantidad, precio: pr?.precio_pactado ?? null };
            });
            const total = items.reduce((sum, it) => sum + (it.precio != null ? it.precio * it.cantidad : 0), 0);
            return {
              pedidoId: pedido.id,
              fecha: ab?.fecha || null,
              estado: pedido.estado,
              items,
              total: totalCompleto && items.length > 0 ? total : null,
            };
          })
          .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

        setHistorial(armado);
      } catch (e) {
        Alert.alert('Error cargando historial', e.message);
        setMostrarHistorial(false);
      } finally {
        setCargandoHistorial(false);
      }
    }
  }

  const toggleSeleccionado = useCallback((productoId) => {
    setSeleccionados((prev) =>
      prev.includes(productoId) ? prev.filter((id) => id !== productoId) : [...prev, productoId]
    );
  }, []);

  // Agrega todos los productos marcados de una vez, sin precio (se pone después,
  // individualmente, con "Poner precio" en la lista principal — no bloquea el alta).
  async function confirmarAgregarVarios() {
    if (seleccionados.length === 0 || agregandoVarios) return;
    setAgregandoVarios(true);
    try {
      const creados = await Promise.all(
        seleccionados.map((productoId) =>
          ProductosRelacionExt.crear({ relacion_id: relacionId, producto_id: productoId, precio_pactado: null })
        )
      );
      setProductosRelacion((prev) => [...prev, ...creados.map((c) => c[0])]);
      setSeleccionados([]);
      setBusquedaProducto('');
      setMostrarPicker(false);
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setAgregandoVarios(false);
    }
  }

  // Decisión de producto (18 jul 2026): el tendero nunca ve la mediana de
  // red — genera fricción con su negociación propia con el proveedor (y
  // expone al proveedor si el tendero nota que paga distinto a otros). La
  // RPC precio_referencia se deja intacta para posible uso interno futuro,
  // simplemente esta pantalla ya no la llama.
  function empezarEdicionPrecio(item) {
    setEditandoId(item.id);
    setPrecioEditado(item.precio_pactado != null ? String(item.precio_pactado) : '');
  }

  async function guardarPrecio(item) {
    if (guardando) return;
    const nuevoPrecio = limpiarNumero(precioEditado);
    setGuardando(true);
    try {
      await ProductosRelacionExt.actualizar(item.id, { precio_pactado: nuevoPrecio });
      // Actualiza solo esa fila en memoria, sin recargar ni mover el scroll
      setProductosRelacion((prev) =>
        prev.map((pr) => (pr.id === item.id ? { ...pr, precio_pactado: nuevoPrecio, precio_actualizado_en: new Date().toISOString() } : pr))
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

  // No depende de `seleccionados` a propósito: marcar/desmarcar una casilla no
  // debería recalcular el filtro+orden del catálogo completo en cada toque.
  const disponibles = useMemo(() => {
    const idsYaAgregados = productosRelacion.map((pr) => pr.producto_id);
    return productosMaestro
      .filter((p) => !idsYaAgregados.includes(p.id))
      .filter((p) => p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()))
      .filter((p) => !categoriaFiltro || p.categoria === categoriaFiltro)
      .filter((p) => !marcaFiltro || p.marca === marcaFiltro)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [productosRelacion, productosMaestro, busquedaProducto, categoriaFiltro, marcaFiltro]);

  // Chips derivados del catálogo ya cargado en memoria — filtrado en cliente,
  // no necesita ninguna consulta nueva (pg_trgm es para búsqueda del lado
  // servidor en ai-proxy/admin, no para esto).
  const categoriasDisponibles = useMemo(
    () => [...new Set(productosMaestro.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [productosMaestro]
  );
  const marcasDisponibles = useMemo(
    () => [...new Set(productosMaestro.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [productosMaestro]
  );

  const conPrecio = productosRelacion.filter((p) => p.precio_pactado != null).length;

  const mostrarFooterAgregar = mostrarPicker && seleccionados.length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: mostrarFooterAgregar ? 24 + alturaFooterAgregar + insets.bottom : 40 + insets.bottom }}
      >
        <Text style={styles.titulo}>{proveedorNombre}</Text>
        <Text style={styles.subtitulo}>Datos específicos de este proveedor para este negocio</Text>

        <TouchableOpacity style={styles.acordeon} onPress={() => setMostrarDatos(!mostrarDatos)}>
          <Text style={styles.acordeonTexto}>{mostrarDatos ? 'Ocultar' : 'Ver / editar'} datos de contacto y condiciones</Text>
        </TouchableOpacity>

        {mostrarDatos && (
          <View style={styles.card}>
            <Text style={styles.labelSoloLectura}>Estos datos los define Compi — solo puedes verlos aquí.</Text>

            <Text style={styles.label}>Nombre del contacto</Text>
            <Text style={styles.valorSoloLectura}>{proveedorMaestro?.contacto_nombre || '—'}</Text>

            <Text style={styles.label}>Teléfono</Text>
            <Text style={styles.valorSoloLectura}>{proveedorMaestro?.telefono || '—'}</Text>

            {proveedorMaestro?.telefono_secundario && (
              <>
                <Text style={styles.label}>Teléfono 2</Text>
                <Text style={styles.valorSoloLectura}>{proveedorMaestro.telefono_secundario}</Text>
              </>
            )}

            <Text style={styles.label}>Dirección de entrega</Text>
            <Text style={styles.valorSoloLectura}>{direccionLocal || '—'}</Text>

            <Text style={styles.label}>Ciudad</Text>
            <Text style={styles.valorSoloLectura}>{proveedorMaestro?.ciudad || '—'}</Text>

            <Text style={styles.label}>Barrio</Text>
            <Text style={styles.valorSoloLectura}>{proveedorMaestro?.barrio || '—'}</Text>

            <Text style={styles.label}>Dirección del proveedor</Text>
            <Text style={styles.valorSoloLectura}>{proveedorMaestro?.direccion || '—'}</Text>

            <View style={styles.separadorEditable}>
              <Text style={styles.labelEditable}>Esto sí lo puedes cambiar tú</Text>
            </View>

            <View style={styles.filaSwitch}>
              <Text style={styles.labelCampoEditable}>Entrega en tu tienda</Text>
              <Switch value={entregaEnTienda} onValueChange={setEntregaEnTienda} trackColor={{ true: COLORS.primary }} />
            </View>
            <Text style={styles.labelCampoEditable}>Días de pedido</Text>
            <TextInput style={styles.inputEditable} placeholder="Ej. Lunes y jueves" value={diasPedido} onChangeText={setDiasPedido} />
            <Text style={styles.labelCampoEditable}>Pedido mínimo ($)</Text>
            <TextInput style={styles.inputEditable} placeholder="Ej. 30000" keyboardType="numeric" value={minimoPedido} onChangeText={setMinimoPedido} />
            <View style={styles.filaSwitch}>
              <Text style={styles.labelCampoEditable}>¿Te fía este proveedor?</Text>
              <Switch value={aceptaCredito} onValueChange={setAceptaCredito} trackColor={{ true: COLORS.primary }} />
            </View>
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
          const presentacion = item.presentacion || prod?.presentacion;
          const unitario = textoPrecioUnitario(item.precio_pactado, item.factor_conversion);
          const viejo = !sinPrecioItem && !enEdicion && precioViejo(item.precio_actualizado_en);

          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.filaTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre}>{prod?.nombre || 'Producto'}</Text>
                  <Text style={styles.itemSub}>{presentacion}{unitario ? ` · ${unitario}` : ''}</Text>
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

              {viejo && (
                <TouchableOpacity onPress={() => empezarEdicionPrecio(item)}>
                  <Text style={styles.avisoPrecioViejo}>Precio de hace más de 2 meses · tócalo si cambió</Text>
                </TouchableOpacity>
              )}

              {enEdicion ? (
                <View style={styles.filaEdicion}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { marginBottom: 0 }]}
                      keyboardType="numeric"
                      placeholder="Sin definir"
                      value={precioEditado}
                      onChangeText={setPrecioEditado}
                    />
                  </View>
                  <TouchableOpacity style={styles.botonMini} disabled={guardando} onPress={() => guardarPrecio(item)}>
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

        <TouchableOpacity style={styles.acordeon} onPress={toggleHistorial}>
          <Text style={styles.acordeonTexto}>{mostrarHistorial ? 'Ocultar' : 'Ver'} historial de pedidos con {proveedorNombre}</Text>
        </TouchableOpacity>

        {mostrarHistorial && (
          <View>
            {cargandoHistorial && <Text style={styles.vacio}>Cargando historial...</Text>}
            {!cargandoHistorial && historial?.length === 0 && (
              <Text style={styles.vacio}>Todavía no le has hecho ningún pedido a este proveedor</Text>
            )}
            {!cargandoHistorial && historial?.map((pedido) => (
              <View key={pedido.pedidoId} style={styles.historialCard}>
                <View style={styles.historialHeader}>
                  <Text style={styles.historialFecha}>
                    {pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha'}
                  </Text>
                  <Text style={styles.historialTotal}>
                    {pedido.total != null ? `$${formatMoney(pedido.total)}` : 'Precio incompleto'}
                  </Text>
                </View>
                {pedido.items.map((it, i) => (
                  <Text key={i} style={styles.historialItem}>• {it.nombre} x{it.cantidad}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {!mostrarPicker ? (
          <TouchableOpacity style={styles.boton} onPress={() => setMostrarPicker(true)}>
            <Text style={styles.botonTexto}>+ Agregar producto</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={styles.subtitulo}>Elige uno o varios productos del catálogo general</Text>
            <TextInput
              style={styles.input}
              placeholder="Buscar producto..."
              value={busquedaProducto}
              onChangeText={setBusquedaProducto}
            />
            {categoriasDisponibles.length > 0 && (
              <>
                <Text style={styles.labelFiltro}>Categoría</Text>
                <ChipsFiltro opciones={categoriasDisponibles} valor={categoriaFiltro} onCambiar={setCategoriaFiltro} />
              </>
            )}
            {marcasDisponibles.length > 0 && (
              <>
                <Text style={styles.labelFiltro}>Marca</Text>
                <ChipsFiltro opciones={marcasDisponibles} valor={marcaFiltro} onCambiar={setMarcaFiltro} />
              </>
            )}
            {disponibles.map((producto) => (
              <FilaPicker
                key={producto.id}
                producto={producto}
                activo={seleccionados.includes(producto.id)}
                onToggle={toggleSeleccionado}
              />
            ))}
            {disponibles.length === 0 && <Text style={styles.vacio}>No hay productos que coincidan</Text>}

            <TouchableOpacity
              style={styles.cancelarPicker}
              onPress={() => { setMostrarPicker(false); setSeleccionados([]); setBusquedaProducto(''); }}
            >
              <Text style={styles.cancelarPickerTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {mostrarFooterAgregar && (
        <View
          style={[styles.footerAgregar, { paddingBottom: 12 + insets.bottom }]}
          onLayout={(e) => setAlturaFooterAgregar(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            style={[styles.boton, { marginTop: 0 }, agregandoVarios && { opacity: 0.5 }]}
            disabled={agregandoVarios}
            onPress={confirmarAgregarVarios}
          >
            <Text style={styles.botonTexto}>
              {agregandoVarios ? 'Agregando...' : `Agregar ${seleccionados.length} producto(s)`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      </View>
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
  labelSoloLectura: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 10, fontStyle: 'italic' },
  valorSoloLectura: { fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12 },
  input: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg, marginBottom: 10 },
  filaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  // A partir de aquí son los únicos 4 campos que el tendero sí puede editar
  // (entrega_en_tienda, dias_pedido, minimo_pedido, acepta_credito) — todo lo
  // de arriba es solo-lectura (dato del proveedor, lo cura el admin). El
  // título + color distinto evita que parezca que también esos son editables.
  separadorEditable: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: 16, paddingTop: 12 },
  labelEditable: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  labelCampoEditable: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  inputEditable: { height: 46, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 10 },
  boton: { marginTop: 14, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  item: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eliminarTexto: { color: COLORS.error, fontSize: 12, fontWeight: '600' },
  itemPicker: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  itemPickerActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkTexto: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  cancelarPicker: { marginTop: 8, height: 40, alignItems: 'center', justifyContent: 'center' },
  footerAgregar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, padding: 16 },
  cancelarPickerTexto: { color: COLORS.textSecondary, fontSize: 13 },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  precioTocable: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 8 },
  avisoPrecio: { marginTop: 8, backgroundColor: COLORS.warningBg, borderRadius: RADIUS.sm, padding: 8 },
  avisoPrecioTexto: { fontSize: 11, color: COLORS.warning, lineHeight: 15 },
  avisoPrecioViejo: { fontSize: 11, color: COLORS.warning, fontWeight: '600', marginTop: 8 },
  chipsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  labelFiltro: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4, textTransform: 'uppercase' },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  chipActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTexto: { fontSize: 12, color: COLORS.text },
  chipTextoActivo: { color: COLORS.white, fontWeight: '600' },
  filaEdicion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 10, paddingHorizontal: 10 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
  totalBox: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 12, marginTop: 4, borderWidth: 0.5, borderColor: COLORS.borderLight },
  historialCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 12, marginTop: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  historialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historialFecha: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  historialTotal: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  historialItem: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  totalTexto: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginVertical: 14, fontSize: 13 },
});