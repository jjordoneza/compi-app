import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  ProveedoresMaestro, RelacionesExt, AbastecimientosExt,
  PedidosExt, PedidoItemsExt, ProductosRelacionExt, ProductosMaestro,
  ProductosRelacion, ReabastecimientoAjustesExt,
} from '../../supabase';
import { COLORS, RADIUS, formatMoney } from '../../theme';

const LIMITE_ABASTECIMIENTOS_STATS = 8;
const MIN_COMPRAS = 3;
const UMBRAL = 1.3;

// --- Lógica del Motor de Reabastecimiento Predictivo (antes vivía en reabastecimiento.js) ---
async function calcularSugerencia(comercioId) {
  const [abastecimientos, relaciones, productosMaestro, ajustes, todosProductosRelacion] = await Promise.all([
    AbastecimientosExt.listarPorComercio(comercioId),
    RelacionesExt.listarPorComercio(comercioId),
    ProductosMaestro.listar(),
    ReabastecimientoAjustesExt.listarPorComercio(comercioId),
    ProductosRelacion.listar(),
  ]);

  if (abastecimientos.length < MIN_COMPRAS) return null;

  const pedidosPorAbastecimiento = await Promise.all(
    abastecimientos.map((ab) => PedidosExt.listarPorAbastecimiento(ab.id))
  );

  const fechaPorAbastecimientoId = {};
  abastecimientos.forEach((ab) => { fechaPorAbastecimientoId[ab.id] = new Date(ab.fecha); });

  const todosPedidosConFecha = [];
  pedidosPorAbastecimiento.forEach((pedidos, i) => {
    const fecha = fechaPorAbastecimientoId[abastecimientos[i].id];
    pedidos.forEach((p) => todosPedidosConFecha.push({ ...p, fecha }));
  });

  const itemsPorPedido = await Promise.all(
    todosPedidosConFecha.map((p) => PedidoItemsExt.listarPorPedido(p.id))
  );

  const fechasPorProducto = {};
  todosPedidosConFecha.forEach((pedido, idx) => {
    const items = itemsPorPedido[idx];
    items.forEach((it) => {
      const pr = todosProductosRelacion.find((x) => x.id === it.producto_relacion_id);
      if (!pr) return;
      const productoId = pr.producto_id;
      if (!fechasPorProducto[productoId]) fechasPorProducto[productoId] = new Set();
      fechasPorProducto[productoId].add(pedido.fecha.toDateString());
    });
  });

  const ahora = new Date();
  const candidatos = [];

  for (const [productoId, fechasSet] of Object.entries(fechasPorProducto)) {
    const fechas = [...fechasSet].map((f) => new Date(f)).sort((a, b) => a - b);
    if (fechas.length < MIN_COMPRAS) continue;

    let sumaIntervalos = 0;
    for (let i = 1; i < fechas.length; i++) {
      sumaIntervalos += (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24);
    }
    const promedioIntervalo = sumaIntervalos / (fechas.length - 1);
    const ultimaCompra = fechas[fechas.length - 1];
    const diasDesdeUltima = (ahora - ultimaCompra) / (1000 * 60 * 60 * 24);
    const umbralDias = promedioIntervalo * UMBRAL;

    if (diasDesdeUltima < umbralDias) continue;

    const ajuste = ajustes.find((a) => a.producto_id === productoId);
    if (ajuste && new Date(ajuste.no_sugerir_antes_de) > ahora) continue;

    candidatos.push({
      productoId,
      diasDesdeUltima: Math.round(diasDesdeUltima),
      promedioIntervalo: Math.round(promedioIntervalo),
      ratio: diasDesdeUltima / umbralDias,
    });
  }

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => b.ratio - a.ratio);
  const elegido = candidatos[0];
  const producto = productosMaestro.find((p) => p.id === elegido.productoId);

  const relacionIds = relaciones.map((r) => r.id);
  const opciones = todosProductosRelacion.filter(
    (pr) => pr.producto_id === elegido.productoId && relacionIds.includes(pr.relacion_id)
  );
  const opcionElegida = opciones.find((o) => o.precio_pactado != null) || opciones[0];
  if (!opcionElegida) return null;

  return {
    productoId: elegido.productoId,
    productoNombre: producto?.nombre || 'Producto',
    diasDesdeUltima: elegido.diasDesdeUltima,
    promedioIntervalo: elegido.promedioIntervalo,
    productoRelacionId: opcionElegida.id,
  };
}
// --- Fin de la lógica del motor ---

export default function InicioScreen({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};
  const [proveedores, setProveedores] = useState([]);
  const [ultimoAbastecimiento, setUltimoAbastecimiento] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    if (!comercioId) return setCargando(false);
    try {
      const [rels, todosProveedores, abastecimientos, productos] = await Promise.all([
        RelacionesExt.listarPorComercio(comercioId),
        ProveedoresMaestro.listar(),
        AbastecimientosExt.listarPorComercio(comercioId),
        ProductosMaestro.listar(),
      ]);

      setProveedores(rels.map((r) => todosProveedores.find((p) => p.id === r.proveedor_id)).filter(Boolean));
      setUltimoAbastecimiento(abastecimientos[0] || null);

      await cargarEstadisticas(abastecimientos.slice(0, LIMITE_ABASTECIMIENTOS_STATS), rels, todosProveedores, productos);

      const sug = await calcularSugerencia(comercioId);
      setSugerencia(sug);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarEstadisticas(abastecimientos, rels, todosProveedores, productos) {
    if (abastecimientos.length === 0) return setEstadisticas(null);

    const pedidosPorAbastecimiento = await Promise.all(
      abastecimientos.map((ab) => PedidosExt.listarPorAbastecimiento(ab.id))
    );
    const todosPedidos = pedidosPorAbastecimiento.flat();

    const itemsPorPedido = await Promise.all(
      todosPedidos.map((p) => PedidoItemsExt.listarPorPedido(p.id))
    );

    const relacionIdsUnicas = [...new Set(todosPedidos.map((p) => p.relacion_id))];
    const productosRelPorRelacionArr = await Promise.all(
      relacionIdsUnicas.map((relId) => ProductosRelacionExt.listarPorRelacion(relId))
    );
    const cacheProductosRel = {};
    relacionIdsUnicas.forEach((relId, i) => { cacheProductosRel[relId] = productosRelPorRelacionArr[i]; });

    const conteoProveedor = {};
    const conteoProducto = {};
    let sumaTotales = 0, totalesValidos = 0;

    todosPedidos.forEach((pedido, idx) => {
      conteoProveedor[pedido.relacion_id] = (conteoProveedor[pedido.relacion_id] || 0) + 1;
      const items = itemsPorPedido[idx];
      const prodRel = cacheProductosRel[pedido.relacion_id] || [];
      let totalPedido = 0, completo = true;

      items.forEach((it) => {
        const pr = prodRel.find((x) => x.id === it.producto_relacion_id);
        const prod = pr ? productos.find((p) => p.id === pr.producto_id) : null;
        const nombre = prod?.nombre || 'Producto';
        conteoProducto[nombre] = (conteoProducto[nombre] || 0) + it.cantidad;
        if (pr && pr.precio_pactado != null) totalPedido += pr.precio_pactado * it.cantidad;
        else completo = false;
      });

      if (completo && totalPedido > 0) { sumaTotales += totalPedido; totalesValidos += 1; }
    });

    const topProveedores = Object.entries(conteoProveedor)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([relId, count]) => {
        const rel = rels.find((r) => r.id === relId);
        const prov = rel ? todosProveedores.find((p) => p.id === rel.proveedor_id) : null;
        return { nombre: prov?.nombre || 'Proveedor', count };
      });

    const topProductos = Object.entries(conteoProducto)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));

    setEstadisticas({
      topProveedores, topProductos,
      promedio: totalesValidos > 0 ? Math.round(sumaTotales / totalesValidos) : null,
    });
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', cargar);
    return unsubscribe;
  }, [navigation, comercioId]);

  if (cargando) return <View style={styles.container} />;

  const fechaUltimo = ultimoAbastecimiento
    ? new Date(ultimoAbastecimiento.fecha).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 60 }}>
      <View style={styles.header}>
        <Text style={styles.saludo}>Hola</Text>
        <Text style={styles.pregunta}>{comercioNombre || 'Tu negocio'}</Text>
      </View>

      {proveedores.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitulo}>Todavía no tienes proveedores</Text>
          <Text style={styles.emptyTexto}>Ve a la pestaña Proveedores para vincular el primero.</Text>
        </View>
      ) : (
        <>
          {sugerencia && (
            <View style={styles.sugerenciaCard}>
              <Text style={styles.sugerenciaLabel}>✦ Según tu patrón de compra</Text>
              <Text style={styles.sugerenciaTitulo}>Ya te tocaría reponer {sugerencia.productoNombre}</Text>
              <Text style={styles.sugerenciaFecha}>Hace {sugerencia.diasDesdeUltima} días no pides este producto</Text>
              <View style={styles.sugerenciaBotones}>
                <TouchableOpacity
                  style={styles.sugerenciaBotonSi}
                  onPress={() => navigation.navigate('NuevoAbastecimiento', {
                    comercioId, comercioNombre, sugerirProductoRelacionId: sugerencia.productoRelacionId,
                  })}
                >
                  <Text style={styles.sugerenciaBotonSiTexto}>Sí, vamos a surtirlo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sugerenciaBotonNo}
                  onPress={() => navigation.navigate('RespuestaReabastecimiento', {
                    comercioId, comercioNombre,
                    productoId: sugerencia.productoId,
                    productoNombre: sugerencia.productoNombre,
                    promedioIntervalo: sugerencia.promedioIntervalo,
                  })}
                >
                  <Text style={styles.sugerenciaBotonNoTexto}>Ya lo compré</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {ultimoAbastecimiento && (
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Lo de siempre</Text>
              <Text style={styles.heroTitulo}>Repetir tu abastecimiento</Text>
              <Text style={styles.heroFecha}>Tu último pedido fue el {fechaUltimo}</Text>
              <TouchableOpacity
                style={styles.heroBoton}
                onPress={() => navigation.navigate('NuevoAbastecimiento', { comercioId, comercioNombre, repetirDeId: ultimoAbastecimiento.id })}
              >
                <Text style={styles.heroBotonTexto}>Revisar y enviar</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.botonNuevo}
            onPress={() => navigation.navigate('NuevoAbastecimiento', { comercioId, comercioNombre })}
          >
            <Text style={styles.botonNuevoTexto}>+ Empezar un pedido nuevo</Text>
          </TouchableOpacity>

          {estadisticas ? (
            <>
              <Text style={styles.seccion}>Tus proveedores más usados</Text>
              {estadisticas.topProveedores.map((p, i) => (
                <View key={i} style={styles.statItem}>
                  <Text style={styles.statNombre}>{p.nombre}</Text>
                  <Text style={styles.statValor}>{p.count} pedido(s)</Text>
                </View>
              ))}

              <Text style={styles.seccion}>Lo que más compras</Text>
              {estadisticas.topProductos.map((p, i) => (
                <View key={i} style={styles.statItem}>
                  <Text style={styles.statNombre}>{p.nombre}</Text>
                  <Text style={styles.statValor}>x{p.cantidad}</Text>
                </View>
              ))}

              {estadisticas.promedio != null && (
                <View style={styles.promedioCard}>
                  <Text style={styles.promedioLabel}>Gasto promedio por abastecimiento</Text>
                  <Text style={styles.promedioValor}>${formatMoney(estadisticas.promedio)}</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.sinDatos}>Haz tu primer abastecimiento para empezar a ver estadísticas de tu negocio aquí.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {},
  saludo: { fontSize: 13, color: COLORS.textSecondary },
  pregunta: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  emptyCard: { marginTop: 20, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.borderLight },
  emptyTitulo: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emptyTexto: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  sugerenciaCard: { marginTop: 16, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: '#C0DD97', padding: 16 },
  sugerenciaLabel: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  sugerenciaTitulo: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginTop: 7 },
  sugerenciaFecha: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  sugerenciaBotones: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sugerenciaBotonSi: { flex: 1, height: 40, borderRadius: RADIUS.sm + 2, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sugerenciaBotonSiTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  sugerenciaBotonNo: { flex: 1, height: 40, borderRadius: RADIUS.sm + 2, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  sugerenciaBotonNoTexto: { color: COLORS.text, fontSize: 12 },
  heroCard: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: 18 },
  heroLabel: { color: '#BFE3E6', fontSize: 12 },
  heroTitulo: { color: COLORS.white, fontSize: 18, fontWeight: '600', marginTop: 8, lineHeight: 24 },
  heroFecha: { color: '#BFE3E6', fontSize: 12, marginTop: 6 },
  heroBoton: { marginTop: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.sm + 2, paddingVertical: 12, alignItems: 'center' },
  heroBotonTexto: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  botonNuevo: { marginTop: 12, height: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonNuevoTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
  seccion: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 20, marginBottom: 8 },
  statItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 0.5, borderColor: COLORS.borderLight },
  statNombre: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  statValor: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  promedioCard: { marginTop: 16, backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: 14 },
  promedioLabel: { fontSize: 12, color: COLORS.text },
  promedioValor: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  sinDatos: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});