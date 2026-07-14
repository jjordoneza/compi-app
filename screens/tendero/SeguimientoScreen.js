import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  PedidosExt, PedidoItemsExt, ProductosMaestro, ProveedoresMaestro,
  RelacionesExt, ProductosRelacionExt,
} from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

const PASOS = ['pendiente', 'confirmado', 'entregado'];
const ETIQUETAS = { pendiente: 'Procesando', confirmado: 'Confirmado', entregado: 'Entregado' };

function Linea({ paso, estadoActual, esUltimo }) {
  const indiceActual = PASOS.indexOf(estadoActual);
  const indicePaso = PASOS.indexOf(paso);
  const completado = indicePaso <= indiceActual;

  return (
    <View style={styles.filaPaso}>
      <View style={styles.columnaPunto}>
        <View style={[styles.punto, completado && styles.puntoCompletado]}>
          {completado && <Text style={styles.puntoCheck}>✓</Text>}
        </View>
        {!esUltimo && <View style={[styles.lineaVertical, completado && styles.lineaCompletada]} />}
      </View>
      <View style={{ paddingTop: 4, paddingBottom: 20 }}>
        <Text style={[styles.pasoTitulo, !completado && styles.pasoTituloInactivo]}>{ETIQUETAS[paso]}</Text>
      </View>
    </View>
  );
}

export default function SeguimientoScreen({ route, navigation }) {
  const { comercioId, comercioNombre, abastecimientoId } = route.params;
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const pedidos = await PedidosExt.listarPorAbastecimiento(abastecimientoId);
      const proveedores = await ProveedoresMaestro.listar();
      const productos = await ProductosMaestro.listar();

      const resultado = [];
      for (const pedido of pedidos) {
        const items = await PedidoItemsExt.listarPorPedido(pedido.id);
        const prodRel = await ProductosRelacionExt.listarPorRelacion(pedido.relacion_id);
        const relacion = await RelacionesExt.obtenerPorId(pedido.relacion_id);
        const proveedor = relacion ? proveedores.find((p) => p.id === relacion.proveedor_id) : null;

        const nombresItems = items.map((it) => {
          const pr = prodRel.find((x) => x.id === it.producto_relacion_id);
          const prod = pr ? productos.find((p) => p.id === pr.producto_id) : null;
          return { nombre: prod?.nombre || 'Producto', cantidad: it.cantidad };
        });

        resultado.push({ proveedorNombre: proveedor?.nombre || 'Proveedor', estado: pedido.estado, items: nombresItems });
      }
      setGrupos(resultado);
    } catch (e) {
      // silencioso en refrescos automáticos, para no interrumpir con alertas repetidas
      console.log('Error refrescando seguimiento', e.message);
    } finally {
      setCargando(false);
    }
  }, [abastecimientoId]);

  // Carga inicial y cada vez que vuelves a esta pantalla
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', cargar);
    return unsubscribe;
  }, [navigation, cargar]);

  // Refresco automático mientras la pantalla está abierta, para sentirse "en vivo"
  useEffect(() => {
    const intervalo = setInterval(cargar, 6000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  if (cargando) return <View style={styles.container} />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {grupos.map((grupo, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.proveedorNombre}>{grupo.proveedorNombre}</Text>
            <Text style={styles.itemsResumen}>{grupo.items.map((it) => `${it.nombre} x${it.cantidad}`).join(' · ')}</Text>

            <View style={styles.timeline}>
              {PASOS.map((paso, j) => (
                <Linea key={paso} paso={paso} estadoActual={grupo.estado} esUltimo={j === PASOS.length - 1} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.botonInicio}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] })}
        >
          <Text style={styles.botonInicioTexto}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: 16, marginBottom: 14, borderWidth: 0.5, borderColor: COLORS.borderLight },
  proveedorNombre: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  itemsResumen: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  timeline: {},
  filaPaso: { flexDirection: 'row' },
  columnaPunto: { alignItems: 'center', width: 28 },
  punto: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  puntoCompletado: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  puntoCheck: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  lineaVertical: { width: 2, flex: 1, backgroundColor: COLORS.border, marginTop: 2 },
  lineaCompletada: { backgroundColor: COLORS.success },
  pasoTitulo: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginLeft: 10 },
  pasoTituloInactivo: { color: COLORS.textSecondary, fontWeight: '400' },
  footer: { padding: 16, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.white },
  botonInicio: { height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  botonInicioTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
});