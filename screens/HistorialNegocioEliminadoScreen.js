import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  AbastecimientosExt, PedidosExt, PedidoItemsExt,
  ProveedoresMaestro, ProductosMaestro, RelacionesExt, ProductosRelacionExt, ComerciosExt,
} from '../supabase';
import { COLORS, RADIUS, formatMoney } from '../theme';

const ETIQUETAS = { pendiente: 'Procesando', confirmado: 'Confirmado', entregado: 'Entregado' };

// Solo lectura a propósito: este negocio está eliminado (soft-delete), así
// que no se arma pedido nuevo ni se edita nada aquí — solo consultar su
// historial, o reactivarlo para volver a operarlo desde Home. Adaptada de
// PedidosTabScreen (misma forma de cargar/expandir detalle), sin tabs ni
// acciones de escritura.
export default function HistorialNegocioEliminadoScreen({ route, navigation }) {
  const { comercioId, comercioNombre } = route.params;
  const [abastecimientos, setAbastecimientos] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [relaciones, setRelaciones] = useState([]);
  const [detalles, setDetalles] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [reactivando, setReactivando] = useState(false);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (detalles[abastecimientoId]) return;
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
          if (!pr || pr.precio_pactado == null) faltaPrecio = true;
          else subtotal += pr.precio_pactado * it.cantidad;
          return { nombre: prod?.nombre || 'Producto', cantidad: it.cantidad };
        });

        grupos.push({
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
    await cargarDetalle(abastecimientoId);
  }

  function confirmarReactivar() {
    Alert.alert(
      'Reactivar negocio',
      `¿Quieres volver a usar "${comercioNombre}"? Vuelve a aparecer en tus negocios y puedes seguir pidiendo desde ahí, con todo tu catálogo e historial intactos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reactivar', onPress: reactivar },
      ]
    );
  }

  async function reactivar() {
    setReactivando(true);
    try {
      await ComerciosExt.actualizar(comercioId, { activo: true });
      navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] });
    } catch (e) {
      Alert.alert('Error reactivando', e.message);
      setReactivando(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
      <Text style={styles.titulo}>{comercioNombre}</Text>
      <Text style={styles.subtitulo}>Este negocio está eliminado — aquí solo puedes consultar su historial.</Text>

      <TouchableOpacity
        style={[styles.botonReactivar, reactivando && { opacity: 0.5 }]}
        disabled={reactivando}
        onPress={confirmarReactivar}
      >
        <Text style={styles.botonReactivarTexto}>{reactivando ? 'Reactivando...' : 'Reactivar este negocio'}</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Historial de pedidos</Text>

      {abastecimientos === null && <Text style={styles.vacio}>Cargando...</Text>}
      {abastecimientos !== null && abastecimientos.length === 0 && (
        <Text style={styles.vacio}>Este negocio nunca hizo un abastecimiento.</Text>
      )}

      {(abastecimientos || []).map((ab) => (
        <View key={ab.id} style={styles.card}>
          <TouchableOpacity style={styles.filaTop} onPress={() => expandir(ab.id)}>
            <View>
              <Text style={styles.fecha}>{new Date(ab.fecha).toLocaleString()}</Text>
              <Text style={styles.estado}>{ETIQUETAS[ab.estado] || 'Procesando'}</Text>
            </View>
            <Text style={styles.verMas}>{expandido === ab.id ? 'Ocultar' : 'Ver detalle'}</Text>
          </TouchableOpacity>

          {expandido === ab.id && detalles[ab.id] && (
            <View style={{ marginTop: 10 }}>
              {detalles[ab.id].map((grupo, i) => (
                <View key={i} style={styles.grupo}>
                  <View style={styles.grupoHeader}>
                    <Text style={styles.grupoProveedor}>{grupo.proveedorNombre}</Text>
                    <View style={[styles.badge, styles[`badge_${grupo.estado}`]]}>
                      <Text style={styles.badgeTexto}>{ETIQUETAS[grupo.estado]}</Text>
                    </View>
                  </View>
                  {grupo.items.map((it, j) => (
                    <Text key={j} style={styles.itemDetalle}>• {it.nombre} x{it.cantidad}</Text>
                  ))}
                  <Text style={styles.subtotal}>
                    {grupo.subtotal != null ? `Subtotal: $${formatMoney(grupo.subtotal)}` : 'Precio incompleto'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  botonReactivar: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  botonReactivarTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  seccion: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 10 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fecha: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  estado: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  verMas: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  grupo: { marginTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, paddingTop: 8, marginBottom: 6 },
  grupoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  grupoProveedor: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  badge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: RADIUS.full },
  badge_pendiente: { backgroundColor: COLORS.warningBg },
  badge_confirmado: { backgroundColor: '#E6F1FB' },
  badge_entregado: { backgroundColor: COLORS.successBg },
  badgeTexto: { fontSize: 10, fontWeight: '600', color: COLORS.text },
  itemDetalle: { fontSize: 12, color: COLORS.text, marginBottom: 2 },
  subtotal: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginTop: 4 },
});
