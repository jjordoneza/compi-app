import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ProveedoresMaestro, ProductosMaestro, RelacionesExt, ProductosRelacionExt,
  PedidoItemsFull, AbastecimientosExt, PedidosExt,
} from '../supabase';
import { COLORS, RADIUS, formatMoney } from '../theme';

const LIMITE_ABASTECIMIENTOS_USO = 15;

function limpiarNumero(texto) {
  const soloDigitos = texto.replace(/[^0-9]/g, '');
  return soloDigitos ? parseInt(soloDigitos, 10) : null;
}

export default function NuevoAbastecimientoScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { comercioId, comercioNombre, repetirDeId, sugerirProductoRelacionId, precargarCantidades } = route.params;
  const [proveedores, setProveedores] = useState([]);
  const [productosPorRelacion, setProductosPorRelacion] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [cargando, setCargando] = useState(true);
  const [usoConteo, setUsoConteo] = useState({}); // relacionId -> num pedidos históricos

  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [expandidoRelacionId, setExpandidoRelacionId] = useState(null);
  const [catalogoCompletoAbierto, setCatalogoCompletoAbierto] = useState([]); // relacionId[]
  const [soloRepetidos, setSoloRepetidos] = useState(false);
  const [alturaFooter, setAlturaFooter] = useState(160);

  const [precioEditandoId, setPrecioEditandoId] = useState(null);
  const [precioEditandoValor, setPrecioEditandoValor] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [relaciones, todosProveedores, todosProductos] = await Promise.all([
        RelacionesExt.listarPorComercio(comercioId),
        ProveedoresMaestro.listar(),
        ProductosMaestro.listar(),
      ]);

      // Pide los productos de TODAS las relaciones en paralelo, no una por una
      const productosRelPorRelacion = await Promise.all(
        relaciones.map((r) => ProductosRelacionExt.listarPorRelacion(r.id))
      );

      const mapa = {};
      const listaProveedores = [];

      relaciones.forEach((r, i) => {
        const prov = todosProveedores.find((p) => p.id === r.proveedor_id);
        const productosRel = productosRelPorRelacion[i];
        if (!prov || productosRel.length === 0) return;

        listaProveedores.push({ relacionId: r.id, proveedor: prov });
        mapa[r.id] = productosRel.map((pr) => ({
          ...pr,
          producto: todosProductos.find((p) => p.id === pr.producto_id),
        }));
      });

      setProveedores(listaProveedores);
      setProductosPorRelacion(mapa);

      // No bloquea el resto de la pantalla si falla: solo afecta el orden sugerido.
      cargarUso(listaProveedores).catch(() => {});

      if (repetirDeId) {
        const grupos = await PedidoItemsFull.listarPorAbastecimientoCompleto(repetirDeId);
        const cantidadesPrevias = {};
        const relacionesConItems = [];
        for (const grupo of grupos) {
          if (grupo.items.length > 0) relacionesConItems.push(grupo.relacionId);
          for (const item of grupo.items) {
            cantidadesPrevias[item.producto_relacion_id] = item.cantidad;
          }
        }
        setCantidades(cantidadesPrevias);
        setSoloRepetidos(true);
        // Precarga: abre de una vez las tarjetas de los proveedores que sí tenían pedido.
        setCatalogoCompletoAbierto([]);
        if (relacionesConItems.length > 0) setExpandidoRelacionId(relacionesConItems[0]);
      } else if (precargarCantidades) {
        setCantidades(precargarCantidades);
        const relacionConPrecarga = listaProveedores.find(({ relacionId }) =>
          (mapa[relacionId] || []).some((pr) => precargarCantidades[pr.id] != null)
        );
        if (relacionConPrecarga) setExpandidoRelacionId(relacionConPrecarga.relacionId);
      } else if (sugerirProductoRelacionId) {
        setCantidades({ [sugerirProductoRelacionId]: 1 });
        const relacionSugerida = listaProveedores.find(({ relacionId }) =>
          (mapa[relacionId] || []).some((pr) => pr.id === sugerirProductoRelacionId)
        );
        if (relacionSugerida) setExpandidoRelacionId(relacionSugerida.relacionId);
      }
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  // "Más usado primero": cuenta pedidos históricos por relación, sobre los últimos
  // abastecimientos del comercio. Es solo para ordenar la lista, no una estadística
  // mostrada — un fallo aquí no debe bloquear el resto de la pantalla.
  async function cargarUso(listaProveedores) {
    const abastecimientos = await AbastecimientosExt.listarPorComercio(comercioId);
    const recientes = abastecimientos.slice(0, LIMITE_ABASTECIMIENTOS_USO);
    const pedidosPorAbastecimiento = await Promise.all(
      recientes.map((ab) => PedidosExt.listarPorAbastecimiento(ab.id))
    );
    const conteo = {};
    pedidosPorAbastecimiento.flat().forEach((p) => {
      conteo[p.relacion_id] = (conteo[p.relacion_id] || 0) + 1;
    });
    setUsoConteo(conteo);
  }

  function cambiarCantidad(productoRelacionId, delta) {
    setCantidades((prev) => {
      const actual = prev[productoRelacionId] || 0;
      const nueva = Math.max(0, actual + delta);
      return { ...prev, [productoRelacionId]: nueva };
    });
  }

  function empezarEditarPrecio(pr) {
    setPrecioEditandoId(precioEditandoId === pr.id ? null : pr.id);
    setPrecioEditandoValor('');
  }

  async function guardarPrecioInline(pr, relacionId) {
    if (guardandoPrecio) return;
    setGuardandoPrecio(true);
    try {
      const nuevoPrecio = limpiarNumero(precioEditandoValor);
      await ProductosRelacionExt.actualizar(pr.id, { precio_pactado: nuevoPrecio });
      setProductosPorRelacion((prev) => ({
        ...prev,
        [relacionId]: prev[relacionId].map((item) =>
          item.id === pr.id ? { ...item, precio_pactado: nuevoPrecio } : item
        ),
      }));
      setPrecioEditandoId(null);
    } catch (e) {
      Alert.alert('Error guardando precio', e.message);
    } finally {
      setGuardandoPrecio(false);
    }
  }

  function toggleExpandido(relacionId) {
    setExpandidoRelacionId((prev) => (prev === relacionId ? null : relacionId));
  }

  function abrirCatalogoCompleto(relacionId) {
    setCatalogoCompletoAbierto((prev) => (prev.includes(relacionId) ? prev : [...prev, relacionId]));
  }

  const todosLosItems = [];
  proveedores.forEach(({ relacionId, proveedor }) => {
    (productosPorRelacion[relacionId] || []).forEach((pr) => {
      todosLosItems.push({ ...pr, relacionId, proveedorNombre: proveedor.nombre });
    });
  });

  const itemsSeleccionados = todosLosItems.filter((it) => (cantidades[it.id] || 0) > 0);
  const itemsSinPrecioSeleccionados = itemsSeleccionados.filter((it) => it.precio_pactado == null);
  const totalProductos = itemsSeleccionados.length;
  const totalEstimado =
    itemsSinPrecioSeleccionados.length === 0 && itemsSeleccionados.length > 0
      ? itemsSeleccionados.reduce((sum, it) => sum + it.precio_pactado * cantidades[it.id], 0)
      : null;

  const proveedoresFiltrados = proveedores
    .filter(({ proveedor }) => proveedor.nombre.toLowerCase().includes(busquedaProveedor.toLowerCase()))
    .map((p) => ({ ...p, seleccionadosCount: (productosPorRelacion[p.relacionId] || []).filter((pr) => (cantidades[pr.id] || 0) > 0).length }))
    .sort((a, b) => {
      const usoA = usoConteo[a.relacionId] || 0;
      const usoB = usoConteo[b.relacionId] || 0;
      if (usoA !== usoB) return usoB - usoA;
      return a.proveedor.nombre.localeCompare(b.proveedor.nombre, 'es');
    });

  function irAConfirmar() {
    if (totalProductos === 0) return;
    const gruposParaEnviar = proveedores
      .map(({ relacionId, proveedor }) => {
        const items = (productosPorRelacion[relacionId] || [])
          .filter((pr) => (cantidades[pr.id] || 0) > 0)
          .map((pr) => ({
            productoRelacionId: pr.id,
            nombre: pr.producto?.nombre || 'Producto',
            presentacion: pr.producto?.presentacion || '',
            cantidad: cantidades[pr.id],
            precio: pr.precio_pactado,
          }));
        return { relacionId, proveedorNombre: proveedor.nombre, items };
      })
      .filter((g) => g.items.length > 0);

    navigation.navigate('ConfirmarPedido', {
      comercioId, comercioNombre, gruposParaEnviar, totalEstimado,
    });
  }

  if (cargando) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitulo}>Cargando proveedores y productos...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: alturaFooter + insets.bottom }}>
        <Text style={styles.titulo}>
          {repetirDeId ? 'Repetir abastecimiento' : precargarCantidades ? 'Pedido desde WhatsApp' : sugerirProductoRelacionId ? 'Reponer sugerido' : 'Nuevo abastecimiento'}
        </Text>
        <Text style={styles.subtitulo}>{comercioNombre}</Text>
        {repetirDeId && (
          <View style={styles.avisoRepetir}>
            <Text style={styles.avisoRepetirTexto}>Precargamos lo que pediste la vez anterior. Ajusta cantidades o agrega más si quieres.</Text>
          </View>
        )}
        {precargarCantidades && (
          <View style={styles.avisoRepetir}>
            <Text style={styles.avisoRepetirTexto}>Preseleccionamos las cantidades del pedido de WhatsApp que acabas de convertir. Ajusta lo que necesites.</Text>
          </View>
        )}
        {sugerirProductoRelacionId && (
          <View style={styles.avisoRepetir}>
            <Text style={styles.avisoRepetirTexto}>Preseleccionamos el producto que te sugerimos reponer. Ajusta cantidades y agrega más si quieres.</Text>
          </View>
        )}

        {proveedores.length === 0 && (
          <Text style={styles.vacio}>Ninguno de tus proveedores tiene productos cargados todavía.</Text>
        )}

        {proveedores.length > 0 && (
          <TextInput
            style={styles.buscador}
            placeholder="Buscar proveedor..."
            value={busquedaProveedor}
            onChangeText={setBusquedaProveedor}
          />
        )}

        {proveedoresFiltrados.map(({ relacionId, proveedor, seleccionadosCount }) => {
          const expandido = expandidoRelacionId === relacionId;
          const catalogoCompleto = !soloRepetidos || catalogoCompletoAbierto.includes(relacionId);
          const itemsProveedor = productosPorRelacion[relacionId] || [];
          const itemsAMostrar = catalogoCompleto
            ? itemsProveedor
            : itemsProveedor.filter((pr) => (cantidades[pr.id] || 0) > 0);
          const hayOcultos = !catalogoCompleto && itemsAMostrar.length < itemsProveedor.length;

          return (
            <View key={relacionId} style={styles.proveedorCard}>
              <TouchableOpacity style={styles.proveedorCardHeader} onPress={() => toggleExpandido(relacionId)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.proveedorNombre}>{proveedor.nombre}</Text>
                  {seleccionadosCount > 0 && (
                    <Text style={styles.proveedorBadge}>{seleccionadosCount} producto(s) seleccionados</Text>
                  )}
                </View>
                <Text style={styles.chevron}>{expandido ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {expandido && (
                <View style={styles.proveedorCardBody}>
                  {itemsAMostrar.map((pr) => {
                    const cant = cantidades[pr.id] || 0;
                    const sinPrecio = pr.precio_pactado == null;
                    const editandoEste = precioEditandoId === pr.id;

                    return (
                      <View key={pr.id} style={styles.item}>
                        <View style={styles.filaItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemNombre}>{pr.producto?.nombre || 'Producto'}</Text>
                            <Text style={styles.itemSub}>
                              {pr.producto?.presentacion}
                              {!sinPrecio ? ` · $${formatMoney(pr.precio_pactado)}` : ''}
                            </Text>
                          </View>
                          <View style={styles.stepper}>
                            <TouchableOpacity style={styles.stepperBoton} onPress={() => cambiarCantidad(pr.id, -1)}>
                              <Text style={styles.stepperTexto}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperNumero}>{cant}</Text>
                            <TouchableOpacity style={[styles.stepperBoton, styles.stepperBotonMas]} onPress={() => cambiarCantidad(pr.id, 1)}>
                              <Text style={[styles.stepperTexto, { color: COLORS.white }]}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {sinPrecio && !editandoEste && (
                          <TouchableOpacity onPress={() => empezarEditarPrecio(pr)}>
                            <Text style={styles.avisoTocable}>Sin precio configurado · tócalo para ponerlo</Text>
                          </TouchableOpacity>
                        )}

                        {editandoEste && (
                          <View style={styles.filaEdicion}>
                            <TextInput
                              style={styles.inputPrecio}
                              keyboardType="numeric"
                              placeholder="Ej. 13500"
                              value={precioEditandoValor}
                              onChangeText={setPrecioEditandoValor}
                            />
                            <TouchableOpacity style={styles.botonMini} disabled={guardandoPrecio} onPress={() => guardarPrecioInline(pr, relacionId)}>
                              <Text style={styles.botonMiniTexto}>{guardandoPrecio ? 'Guardando...' : 'Guardar'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setPrecioEditandoId(null)}>
                              <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {hayOcultos && (
                    <TouchableOpacity onPress={() => abrirCatalogoCompleto(relacionId)}>
                      <Text style={styles.verCatalogoLink}>+ Agregar otro producto de este proveedor</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
        onLayout={(e) => setAlturaFooter(e.nativeEvent.layout.height)}
      >
        <View style={styles.footerFila}>
          <Text style={styles.footerTexto}>{totalProductos} producto(s) seleccionados</Text>
          {totalEstimado != null ? (
            <Text style={styles.footerTotal}>Total estimado: ${formatMoney(totalEstimado)}</Text>
          ) : null}
        </View>

        {totalProductos > 0 && totalEstimado == null && itemsSinPrecioSeleccionados.length > 0 && (
          <View style={styles.avisoTotalBox}>
            <Text style={styles.avisoTotalTexto}>
              No podemos calcular el total: {itemsSinPrecioSeleccionados.length} producto(s) seleccionados no tienen precio configurado. Ponles precio arriba para desbloquear el total.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.botonEnviar, totalProductos === 0 && { opacity: 0.4 }]}
          disabled={totalProductos === 0}
          onPress={irAConfirmar}
        >
          <Text style={styles.botonEnviarTexto}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  avisoRepetir: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.sm, padding: 10, marginBottom: 14 },
  avisoRepetirTexto: { fontSize: 12, color: COLORS.text },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  buscador: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 14 },
  proveedorCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight, overflow: 'hidden' },
  proveedorCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  proveedorNombre: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  proveedorBadge: { fontSize: 11, color: COLORS.success, marginTop: 3, fontWeight: '600' },
  chevron: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 },
  proveedorCardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  verCatalogoLink: { fontSize: 12, color: COLORS.primary, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 4 },
  item: { backgroundColor: COLORS.bg, padding: 12, borderRadius: RADIUS.md, marginBottom: 8 },
  filaItem: { flexDirection: 'row', alignItems: 'center' },
  itemNombre: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBoton: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepperBotonMas: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepperTexto: { fontSize: 18, color: COLORS.primary, fontWeight: '600' },
  stepperNumero: { fontSize: 16, fontWeight: '600', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  avisoTocable: { fontSize: 11, color: COLORS.warning, marginTop: 8, fontWeight: '600' },
  filaEdicion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  inputPrecio: { flex: 1, height: 40, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 13, color: COLORS.text, backgroundColor: COLORS.white },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 9, paddingHorizontal: 12, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 9, paddingHorizontal: 8 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, padding: 16 },
  footerFila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  footerTexto: { fontSize: 12, color: COLORS.textSecondary },
  footerTotal: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  avisoTotalBox: { backgroundColor: COLORS.warningBg, borderRadius: RADIUS.sm, padding: 10, marginBottom: 10 },
  avisoTotalTexto: { fontSize: 11, color: COLORS.warning, lineHeight: 16 },
  botonEnviar: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonEnviarTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
});
