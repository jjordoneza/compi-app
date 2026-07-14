import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import {
  AbastecimientosExt, PedidosExt, PedidoItemsExt, Pedidos,
  ProveedoresMaestro, ProductosMaestro, RelacionesExt, ProductosRelacionExt,
} from '../supabase';
import { COLORS, RADIUS, formatMoney } from '../theme';

const ESTADOS = ['pendiente', 'confirmado', 'entregado'];
const ETIQUETAS = { pendiente: 'Procesando', confirmado: 'Confirmado', entregado: 'Entregado' };

function siguienteEstado(estadoActual) {
  const i = ESTADOS.indexOf(estadoActual);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

function calcularEstadoGeneral(grupos) {
  if (grupos.length === 0) return 'procesando';
  if (grupos.every((g) => g.estado === 'entregado')) return 'entregado';
  if (grupos.every((g) => g.estado === 'confirmado' || g.estado === 'entregado')) return 'confirmado';
  return 'procesando';
}

export default function PedidosScreen({ route }) {
  const { comercioId } = route.params;
  const [abastecimientos, setAbastecimientos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [relaciones, setRelaciones] = useState([]);
  const [detalles, setDetalles] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [actualizandoId, setActualizandoId] = useState(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    try {
      const [lista, todosProveedores, relacionesComercio] = await Promise.all([
        AbastecimientosExt.listarPorComercio(comercioId),
        ProveedoresMaestro.listar(),
        RelacionesExt.listarPorComercio(comercioId),
      ]);
      setAbastecimientos(lista);
      setProveedores(todosProveedores);
      setRelaciones(relacionesComercio);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  async function cargarDetalle(abastecimientoId) {
    try {
      const pedidos = await PedidosExt.listarPorAbastecimiento(abastecimientoId);
      const productos = await ProductosMaestro.listar();

      const grupos = [];
      for (const pedido of pedidos) {
        const items = await PedidoItemsExt.listarPorPedido(pedido.id);
        const productosRelDeEstaRelacion = await ProductosRelacionExt.listarPorRelacion(pedido.relacion_id);

        const relacion = relaciones.find((r) => r.id === pedido.relacion_id);
        const proveedor = relacion ? proveedores.find((p) => p.id === relacion.proveedor_id) : null;

        let subtotal = 0;
        let faltaPrecio = false;
        const nombresItems = items.map((it) => {
          const pr = productosRelDeEstaRelacion.find((x) => x.id === it.producto_relacion_id);
          const prod = pr ? productos.find((p) => p.id === pr.producto_id) : null;
          if (!pr || pr.precio_pactado == null) {
            faltaPrecio = true;
          } else {
            subtotal += pr.precio_pactado * it.cantidad;
          }
          return { nombre: prod?.nombre || 'Producto', cantidad: it.cantidad };
        });

        grupos.push({
          pedidoId: pedido.id,
          estado: pedido.estado,
          proveedorNombre: proveedor?.nombre || 'Proveedor',
          items: nombresItems,
          subtotal: faltaPrecio ? null : subtotal,
        });
      }
      setDetalles((prev) => ({ ...prev, [abastecimientoId]: grupos }));
    } catch (e) {
      Alert.alert('Error cargando detalle', e.message);
    }
  }

  async function expandir(abastecimientoId) {
    if (expandido === abastecimientoId) {
      setExpandido(null);
      return;
    }
    setExpandido(abastecimientoId);
    if (!detalles[abastecimientoId]) await cargarDetalle(abastecimientoId);
  }

  function confirmarAvanzarEstado(abastecimientoId, grupo) {
    const siguiente = siguienteEstado(grupo.estado);
    if (!siguiente) return;
    Alert.alert(
      'Actualizar estado',
      `¿Marcar el pedido de ${grupo.proveedorNombre} como "${ETIQUETAS[siguiente]}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, actualizar', onPress: () => avanzarEstado(abastecimientoId, grupo, siguiente) },
      ]
    );
  }

  async function avanzarEstado(abastecimientoId, grupo, nuevoEstado) {
    if (actualizandoId) return;
    setActualizandoId(grupo.pedidoId);
    try {
      await Pedidos.actualizar(grupo.pedidoId, { estado: nuevoEstado });

      const gruposActualizados = detalles[abastecimientoId].map((g) =>
        g.pedidoId === grupo.pedidoId ? { ...g, estado: nuevoEstado } : g
      );
      setDetalles((prev) => ({ ...prev, [abastecimientoId]: gruposActualizados }));

      // Recalcula y guarda el estado general del abastecimiento
      const estadoGeneral = calcularEstadoGeneral(gruposActualizados);
      await AbastecimientosExt.actualizar(abastecimientoId, { estado: estadoGeneral });
      setAbastecimientos((prev) =>
        prev.map((ab) => (ab.id === abastecimientoId ? { ...ab, estado: estadoGeneral } : ab))
      );
    } catch (e) {
      Alert.alert('Error actualizando', e.message);
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Tus abastecimientos</Text>

      {abastecimientos.length === 0 && (
        <Text style={styles.vacio}>Todavía no has hecho ningún abastecimiento.</Text>
      )}

      {abastecimientos.map((ab) => (
        <View key={ab.id} style={styles.card}>
          <TouchableOpacity style={styles.filaTop} onPress={() => expandir(ab.id)}>
            <View>
              <Text style={styles.fecha}>{new Date(ab.fecha).toLocaleString()}</Text>
              <Text style={styles.estado}>{ETIQUETAS[ab.estado] || ab.estado}</Text>
            </View>
            <Text style={styles.verMas}>{expandido === ab.id ? 'Ocultar' : 'Ver detalle'}</Text>
          </TouchableOpacity>

          {expandido === ab.id && detalles[ab.id] && (
            <View style={{ marginTop: 10 }}>
              {detalles[ab.id].map((grupo, i) => {
                const siguiente = siguienteEstado(grupo.estado);
                return (
                  <View key={i} style={styles.grupo}>
                    <View style={styles.grupoHeader}>
                      <Text style={styles.grupoProveedor}>{grupo.proveedorNombre}</Text>
                      <Text style={styles.grupoSubtotal}>
                        {grupo.subtotal != null ? `$${formatMoney(grupo.subtotal)}` : 'Precio incompleto'}
                      </Text>
                    </View>

                    {grupo.items.map((it, j) => (
                      <Text key={j} style={styles.itemDetalle}>• {it.nombre} x{it.cantidad}</Text>
                    ))}

                    <View style={styles.estadoFila}>
                      <View style={[styles.badge, styles[`badge_${grupo.estado}`]]}>
                        <Text style={styles.badgeTexto}>{ETIQUETAS[grupo.estado]}</Text>
                      </View>

                      {siguiente && (
                        <TouchableOpacity
                          style={styles.botonAvanzar}
                          disabled={actualizandoId === grupo.pedidoId}
                          onPress={() => confirmarAvanzarEstado(ab.id, grupo)}
                        >
                          <Text style={styles.botonAvanzarTexto}>
                            {actualizandoId === grupo.pedidoId ? 'Actualizando...' : `Marcar como ${ETIQUETAS[siguiente]}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 14 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fecha: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  estado: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  verMas: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  grupo: { marginTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, paddingTop: 8, marginBottom: 6 },
  grupoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  grupoProveedor: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  grupoSubtotal: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  itemDetalle: { fontSize: 12, color: COLORS.text, marginBottom: 2 },
  estadoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.full },
  badge_pendiente: { backgroundColor: COLORS.warningBg },
  badge_confirmado: { backgroundColor: '#E6F1FB' },
  badge_entregado: { backgroundColor: COLORS.successBg },
  badgeTexto: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  botonAvanzar: { backgroundColor: COLORS.primary, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm },
  botonAvanzarTexto: { color: COLORS.white, fontSize: 11, fontWeight: '600' },
});