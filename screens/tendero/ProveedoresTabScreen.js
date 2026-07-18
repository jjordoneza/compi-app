import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { ProveedoresMaestro, RelacionesExt, SugerenciasCambio, SugerenciasCambioExt, ProveedoresSugeridosExt } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

const ETIQUETAS_SUG = { pendiente: 'Pendiente', aprobada: 'Aprobado', rechazada: 'Rechazado' };
// proveedores_sugeridos usa 'aprobado'/'rechazado' (sin la 'a' de género),
// distinto de sugerencias_cambio_proveedor ('aprobada'/'rechazada') — mismo
// componente de pill, etiquetas separadas para no mezclar los dos estados.
const ETIQUETAS_PROVEEDOR_SUGERIDO = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };

export default function ProveedoresTabScreen({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};
  const [relacionesLista, setRelacionesLista] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  // Proveedores que este comercio propuso (vía Importar contactos) y todavía
  // no están vinculados — antes no se veía su estado en ningún lado de la app.
  const [proveedoresPropuestos, setProveedoresPropuestos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [eliminandoId, setEliminandoId] = useState(null);

  const [editandoContactoId, setEditandoContactoId] = useState(null);
  const [telefonoContactoValor, setTelefonoContactoValor] = useState('');

  const [proponiendoId, setProponiendoId] = useState(null);
  const [telefonoPropuestaValor, setTelefonoPropuestaValor] = useState('');

  useEffect(() => {
    // "focus" (no solo mount): esta pantalla necesita enterarse de cambios hechos
    // en otro lado — agregar un proveedor en AgregarProveedorScreen, o que un admin
    // apruebe un cambio de teléfono — sin eso, solo se refrescaba reabriendo la app.
    const unsubscribe = navigation.addListener('focus', cargar);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, comercioId]);

  async function cargar() {
    if (!comercioId) return;
    try {
      const relaciones = await RelacionesExt.listarPorComercio(comercioId); // incl. inactivas
      const todos = await ProveedoresMaestro.listar();
      const sugs = await SugerenciasCambioExt.listarPorComercio(comercioId);
      setSugerencias(sugs);
      const propuestos = await ProveedoresSugeridosExt.listarPorComercio(comercioId);
      // Una vez aprobado, el proveedor ya aparece en la lista principal de abajo
      // (vinculado) — mostrarlo también aquí sería redundante.
      setProveedoresPropuestos(propuestos.filter((p) => p.estado !== 'aprobado'));
      setRelacionesLista(
        relaciones
          .filter((r) => r.activo)
          .map((r) => ({ relacion: r, proveedor: todos.find((p) => p.id === r.proveedor_id) }))
          .filter((x) => x.proveedor)
      );
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  // Siempre soft-delete (decisión de producto, 18 jul 2026): "Quitar
  // proveedor" nunca borra el catálogo/precios, con o sin historial de
  // pedidos — solo desactiva la relación. Reactivar desde Agregar proveedor
  // siempre recupera todo.
  function iniciarEliminarProveedor(relacion, proveedor) {
    if (eliminandoId) return;
    Alert.alert(
      'Quitar proveedor',
      `¿Quitar a ${proveedor.nombre} de tu lista? Tu catálogo, precios e historial con este proveedor quedan intactos — puedes volver a agregarlo cuando quieras y todo sigue ahí.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => desactivarProveedor(relacion.id) },
      ]
    );
  }

  async function desactivarProveedor(relacionId) {
    setEliminandoId(relacionId);
    try {
      await RelacionesExt.actualizar(relacionId, { activo: false });
      await cargar();
    } catch (e) {
      Alert.alert('Error quitando', e.message);
    } finally {
      setEliminandoId(null);
    }
  }

  function empezarEditarContacto(relacion) {
    setEditandoContactoId(relacion.id);
    setTelefonoContactoValor(relacion.telefono_contacto || '');
  }

  async function guardarContacto(relacion) {
    try {
      await RelacionesExt.actualizar(relacion.id, { telefono_contacto: telefonoContactoValor });
      setRelacionesLista((prev) =>
        prev.map((x) => (x.relacion.id === relacion.id ? { ...x, relacion: { ...x.relacion, telefono_contacto: telefonoContactoValor } } : x))
      );
      setEditandoContactoId(null);
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    }
  }

  function empezarProponer(proveedor) {
    setProponiendoId(proveedor.id);
    setTelefonoPropuestaValor('');
  }

  // Celular colombiano: 10 dígitos exactos, empieza en 3 (rango de móviles).
  function telefonoValido(texto) {
    const soloDigitos = texto.replace(/\D/g, '');
    return /^3\d{9}$/.test(soloDigitos);
  }

  async function enviarPropuesta(proveedor) {
    const soloDigitos = telefonoPropuestaValor.replace(/\D/g, '');
    if (!telefonoValido(telefonoPropuestaValor)) {
      Alert.alert('Número inválido', 'Debe ser un celular colombiano de 10 dígitos que empiece en 3 (ej. 3001234567).');
      return;
    }
    try {
      const creada = await SugerenciasCambio.crear({
        proveedor_id: proveedor.id,
        comercio_id: comercioId,
        telefono_sugerido: soloDigitos,
        estado: 'pendiente',
      });
      setSugerencias((prev) => [creada[0], ...prev]);
      setProponiendoId(null);
    } catch (e) {
      Alert.alert('Error enviando', e.message);
    }
  }

  function ultimaSugerenciaPara(proveedorId) {
    return sugerencias.find((s) => s.proveedor_id === proveedorId);
  }

  const filtrados = relacionesLista
    .filter((x) => x.proveedor.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => a.proveedor.nombre.localeCompare(b.proveedor.nombre, 'es'));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={styles.titulo}>Mis proveedores</Text>

      {proveedoresPropuestos.length > 0 && (
        <View style={styles.propuestosBox}>
          <Text style={styles.propuestosTitulo}>Proveedores que enviaste a revisión</Text>
          {proveedoresPropuestos.map((p) => (
            <View key={p.id} style={styles.propuestoFila}>
              <View style={{ flex: 1 }}>
                <Text style={styles.propuestoNombre}>{p.nombre}</Text>
                {p.estado === 'rechazado' && p.motivo_rechazo && (
                  <Text style={styles.propuestoMotivo}>Motivo: {p.motivo_rechazo}</Text>
                )}
              </View>
              <View style={[styles.pillEstado, styles[`pill_${p.estado === 'aprobado' ? 'aprobada' : p.estado === 'rechazado' ? 'rechazada' : 'pendiente'}`]]}>
                <Text style={styles.pillEstadoTexto}>{ETIQUETAS_PROVEEDOR_SUGERIDO[p.estado]}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <TextInput style={styles.buscador} placeholder="Buscar proveedor..." value={busqueda} onChangeText={setBusqueda} />

      {filtrados.length === 0 && <Text style={styles.vacio}>No tienes proveedores todavía</Text>}

      {filtrados.map((item) => {
        const { relacion, proveedor } = item;
        const enEdicionContacto = editandoContactoId === relacion.id;
        const enPropuesta = proponiendoId === proveedor.id;
        const sugerencia = ultimaSugerenciaPara(proveedor.id);
        const puedeProponerNueva = !sugerencia || sugerencia.estado !== 'pendiente';

        return (
          <View key={relacion.id} style={styles.item}>
            <TouchableOpacity
              onPress={() => navigation.navigate('RelacionDetalle', { relacionId: relacion.id, proveedorNombre: proveedor.nombre })}
            >
              <Text style={styles.itemNombre}>{proveedor.nombre}</Text>
              <Text style={styles.itemSub}>{proveedor.categoria || 'Sin categoría'}</Text>
              <Text style={styles.linkVerProductos}>Ver / agregar productos y precios →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('PegarPedido', { comercioId, comercioNombre, relacionId: relacion.id, proveedorNombre: proveedor.nombre })}
            >
              <Text style={styles.linkPegarPedido}>✦ Pegar un pedido de WhatsApp con este proveedor</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Mi contacto con este proveedor</Text>
            {enEdicionContacto ? (
              <View style={styles.filaEdicion}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  keyboardType="phone-pad"
                  placeholder="300 000 0000"
                  value={telefonoContactoValor}
                  onChangeText={setTelefonoContactoValor}
                />
                <TouchableOpacity style={styles.botonMini} onPress={() => guardarContacto(relacion)}>
                  <Text style={styles.botonMiniTexto}>Guardar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setEditandoContactoId(null)}>
                  <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => empezarEditarContacto(relacion)}>
                <Text style={styles.tocable}>{relacion.telefono_contacto || 'Sin definir'} · editar</Text>
              </TouchableOpacity>
            )}

            {sugerencia && (
              <>
                <View style={styles.sugerenciaFila}>
                  <Text style={styles.sugerenciaTexto}>Enviado a actualización: {sugerencia.telefono_sugerido}</Text>
                  <View style={[styles.pillEstado, styles[`pill_${sugerencia.estado}`]]}>
                    <Text style={styles.pillEstadoTexto}>{ETIQUETAS_SUG[sugerencia.estado]}</Text>
                  </View>
                </View>
                {sugerencia.estado === 'rechazada' && sugerencia.motivo_rechazo && (
                  <Text style={styles.propuestoMotivo}>Motivo: {sugerencia.motivo_rechazo}</Text>
                )}
              </>
            )}

            {puedeProponerNueva && (
              <>
                <Text style={styles.avisoTexto}>Este número es solo tuyo. Si el proveedor cambió el número para todo el mundo,</Text>
                {!enPropuesta ? (
                  <TouchableOpacity onPress={() => empezarProponer(proveedor)}>
                    <Text style={styles.linkTexto}>avísale a Compi para actualizarlo</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.filaEdicion}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      keyboardType="phone-pad"
                      placeholder="Nuevo número"
                      value={telefonoPropuestaValor}
                      onChangeText={setTelefonoPropuestaValor}
                    />
                    <TouchableOpacity style={styles.botonMini} onPress={() => enviarPropuesta(proveedor)}>
                      <Text style={styles.botonMiniTexto}>Enviar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setProponiendoId(null)}>
                      <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.eliminarBoton}
              disabled={eliminandoId === relacion.id}
              onPress={() => iniciarEliminarProveedor(relacion, proveedor)}
            >
              <Text style={styles.eliminarProveedorTexto}>
                {eliminandoId === relacion.id ? 'Un momento...' : 'Quitar proveedor'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.boton}
        onPress={() => navigation.navigate('AgregarProveedor', { comercioId })}
      >
        <Text style={styles.botonTexto}>+ Agregar proveedor</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 14 },
  buscador: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 14 },
  item: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  linkVerProductos: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 6 },
  linkPegarPedido: { fontSize: 12, color: COLORS.success, fontWeight: '600', marginTop: 6 },
  label: { fontSize: 11, color: COLORS.textSecondary, marginTop: 10, marginBottom: 4 },
  tocable: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  avisoTexto: { fontSize: 10, color: COLORS.textSecondary, marginTop: 8 },
  linkTexto: { fontSize: 11, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
  eliminarBoton: { marginTop: 12, alignSelf: 'flex-start' },
  eliminarProveedorTexto: { fontSize: 12, color: COLORS.error, fontWeight: '600' },
  sugerenciaFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, backgroundColor: COLORS.bg, borderRadius: RADIUS.sm, padding: 8 },
  sugerenciaTexto: { fontSize: 11, color: COLORS.text, flex: 1, marginRight: 8 },
  pillEstado: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: RADIUS.full },
  pill_pendiente: { backgroundColor: COLORS.warningBg },
  pill_aprobada: { backgroundColor: COLORS.successBg },
  pill_rechazada: { backgroundColor: '#FBEAEA' },
  pillEstadoTexto: { fontSize: 10, fontWeight: '700', color: COLORS.text },
  input: { height: 40, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 13, color: COLORS.text, backgroundColor: COLORS.bg },
  filaEdicion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 9, paddingHorizontal: 12, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 9, paddingHorizontal: 8 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 8, marginBottom: 8, fontSize: 12 },
  propuestosBox: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: COLORS.borderLight },
  propuestosTitulo: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase' },
  propuestoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  propuestoNombre: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  propuestoMotivo: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  boton: { marginTop: 10, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
});
