import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  ProveedoresMaestro, RelacionesExt, AbastecimientosExt,
  PedidosExt, PedidoItemsExt, ProductosRelacionExt, ProductosMaestro,
  Reabastecimiento, ReabastecimientoSugerencias, ReabastecimientoSugerenciasExt,
} from '../../supabase';
import { useComercioActual } from '../../comercioActual';
import { COLORS, RADIUS, formatMoney } from '../../theme';

const LIMITE_ABASTECIMIENTOS_STATS = 8;

// El cálculo del Motor de Reabastecimiento Predictivo vive en el núcleo (Postgres):
// RPC sugerencia_reabastecimiento. El multiplicador lo gobierna la RPC (no se pasa
// desde el cliente), para poder recalibrarlo en SQL sin tocar la app.
async function obtenerSugerencia(comercioId) {
  const fila = await Reabastecimiento.sugerencia(comercioId);
  if (!fila || !fila.producto_relacion_id) return null;
  return {
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre || 'Producto',
    productoRelacionId: fila.producto_relacion_id,
    diasDesdeUltima: fila.dias_desde_ultima,
    promedioIntervalo: Math.round(fila.promedio_intervalo),
    // crudos, para instrumentación:
    _promedioIntervaloRaw: fila.promedio_intervalo,
    _umbralDias: fila.umbral_dias,
    _multiplicadorUsado: fila.multiplicador_usado,
  };
}

// Instrumentación (PR-B): registra la sugerencia mostrada y devuelve su id.
// Si ya hay una pendiente para el mismo producto, la reutiliza (evita duplicar en
// cada focus del Home). Si la pendiente es de otro producto, la marca 'ignorada'.
async function registrarSugerencia(comercioId, sug) {
  const pendientes = await ReabastecimientoSugerenciasExt.listarPendientesPorComercio(comercioId);
  const existente = pendientes.find((s) => s.producto_id === sug.productoId);
  if (existente) return { ...sug, sugerenciaId: existente.id };

  await Promise.all(
    pendientes.map((s) =>
      ReabastecimientoSugerencias.actualizar(s.id, {
        respuesta: 'ignorada',
        respondida_en: new Date().toISOString(),
      })
    )
  );

  const payload = {
    comercio_id: comercioId,
    producto_id: sug.productoId,
    producto_relacion_id: sug.productoRelacionId,
    promedio_intervalo: sug._promedioIntervaloRaw,
    // Valor exacto que devolvió la RPC (no derivado ni constante del cliente).
    multiplicador_usado: sug._multiplicadorUsado,
    umbral_dias: sug._umbralDias,
    dias_desde_ultima: sug.diasDesdeUltima,
    respuesta: 'pendiente',
  };

  try {
    const creada = await ReabastecimientoSugerencias.crear(payload);
    return { ...sug, sugerenciaId: creada[0].id };
  } catch (e) {
    // El índice único parcial puede rechazar un insert concurrente (doble focus):
    // reusa la fila pendiente que sí ganó la carrera.
    const otras = await ReabastecimientoSugerenciasExt.listarPendientesPorComercio(comercioId);
    const ganadora = otras.find((s) => s.producto_id === sug.productoId);
    if (ganadora) return { ...sug, sugerenciaId: ganadora.id };
    throw e;
  }
}

export default function InicioScreen({ navigation, route }) {
  const { comercioId } = route.params || {};
  const { comercioActual } = useComercioActual();
  const comercioNombre = comercioActual?.comercioNombre ?? route.params?.comercioNombre;
  const [proveedores, setProveedores] = useState([]);
  const [ultimoAbastecimiento, setUltimoAbastecimiento] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);
  const [proveedoresPendientes, setProveedoresPendientes] = useState(0);
  const [avisoDescartado, setAvisoDescartado] = useState(false);
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

      // Catálogos por relación: una sola carga, reutilizada aquí y en estadísticas.
      const catalogos = await Promise.all(rels.map((r) => ProductosRelacionExt.listarPorRelacion(r.id)));
      const cacheProductosRel = {};
      rels.forEach((r, i) => { cacheProductosRel[r.id] = catalogos[i]; });

      // Pantalla 28: proveedores vinculados que aún no tienen catálogo.
      setProveedoresPendientes(rels.filter((r) => (cacheProductosRel[r.id] || []).length === 0).length);

      await cargarEstadisticas(abastecimientos.slice(0, LIMITE_ABASTECIMIENTOS_STATS), rels, todosProveedores, productos, cacheProductosRel);

      let sug = await obtenerSugerencia(comercioId);
      if (sug) {
        // Un fallo de logging no debe impedir mostrar la sugerencia.
        try { sug = await registrarSugerencia(comercioId, sug); } catch (e) { /* noop */ }
      }
      setSugerencia(sug);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarEstadisticas(abastecimientos, rels, todosProveedores, productos, cacheProductosRel) {
    if (abastecimientos.length === 0) return setEstadisticas(null);

    const pedidosPorAbastecimiento = await Promise.all(
      abastecimientos.map((ab) => PedidosExt.listarPorAbastecimiento(ab.id))
    );
    const todosPedidos = pedidosPorAbastecimiento.flat();

    const itemsPorPedido = await Promise.all(
      todosPedidos.map((p) => PedidoItemsExt.listarPorPedido(p.id))
    );

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
          {proveedoresPendientes > 0 && !avisoDescartado && (
            <View style={styles.avisoCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.avisoTitulo}>Te faltan {proveedoresPendientes} proveedor(es) por catalogar</Text>
                <Text style={styles.avisoTexto}>Arma su catálogo para poder pedirles.</Text>
                <TouchableOpacity onPress={() => navigation.navigate('OnboardingProveedores', { comercioId, comercioNombre })}>
                  <Text style={styles.avisoLink}>Continuar →</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setAvisoDescartado(true)} style={styles.avisoCerrar}>
                <Text style={styles.avisoCerrarTexto}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {sugerencia && (
            <View style={styles.sugerenciaCard}>
              <Text style={styles.sugerenciaLabel}>✦ Según tu patrón de compra</Text>
              <Text style={styles.sugerenciaTitulo}>Ya te tocaría reponer {sugerencia.productoNombre}</Text>
              <Text style={styles.sugerenciaFecha}>Hace {sugerencia.diasDesdeUltima} días no pides este producto</Text>
              <View style={styles.sugerenciaBotones}>
                <TouchableOpacity
                  style={styles.sugerenciaBotonSi}
                  onPress={() => {
                    if (sugerencia.sugerenciaId) {
                      ReabastecimientoSugerencias.actualizar(sugerencia.sugerenciaId, {
                        respuesta: 'aceptada',
                        respondida_en: new Date().toISOString(),
                      }).catch(() => {});
                    }
                    navigation.navigate('NuevoAbastecimiento', {
                      comercioId, comercioNombre, sugerirProductoRelacionId: sugerencia.productoRelacionId,
                    });
                  }}
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
                    sugerenciaId: sugerencia.sugerenciaId,
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
  avisoCard: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.warningBg, borderRadius: RADIUS.md, padding: 14 },
  avisoTitulo: { fontSize: 13, fontWeight: '600', color: COLORS.warning },
  avisoTexto: { fontSize: 12, color: COLORS.warning, marginTop: 3, lineHeight: 16 },
  avisoLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  avisoCerrar: { paddingHorizontal: 6, paddingVertical: 2 },
  avisoCerrarTexto: { fontSize: 14, color: COLORS.warning },
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