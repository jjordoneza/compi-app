import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ProveedoresMaestro, ProductosMaestro, RelacionesExt, ProductosRelacionExt,
  PedidoItemsFull,
} from '../supabase';
import { COLORS, RADIUS, formatMoney } from '../theme';

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

      if (repetirDeId) {
        const grupos = await PedidoItemsFull.listarPorAbastecimientoCompleto(repetirDeId);
        const cantidadesPrevias = {};
        for (const grupo of grupos) {
          for (const item of grupo.items) {
            cantidadesPrevias[item.producto_relacion_id] = item.cantidad;
          }
        }
        setCantidades(cantidadesPrevias);
      } else if (precargarCantidades) {
        setCantidades(precargarCantidades);
      } else if (sugerirProductoRelacionId) {
        setCantidades({ [sugerirProductoRelacionId]: 1 });
      }
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
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
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        <Text style={styles.titulo}>
          {repetirDeId ? 'Repetir abastecimiento' : precargarCantidades ? 'Pedido desde WhatsApp' : sugerirProductoRelacionId ? 'Reponer sugerido' : 'Nuevo abastecimiento'}
        </Text>
        <Text style={styles.subtitulo}>{comercioNombre}</Text>
        {repetirDeId && (
          <View style={styles.avisoRepetir}>
            <Text style={styles.avisoRepetirTexto}>Precargamos las cantidades de tu último pedido. Ajusta lo que necesites.</Text>
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

        {proveedores.map(({ relacionId, proveedor }) => (
          <View key={relacionId} style={{ marginBottom: 18 }}>
            <Text style={styles.proveedorNombre}>{proveedor.nombre}</Text>
            {productosPorRelacion[relacionId].map((pr) => {
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
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
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
  proveedorNombre: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  item: { backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
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
  inputPrecio: { flex: 1, height: 40, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 13, color: COLORS.text, backgroundColor: COLORS.bg },
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