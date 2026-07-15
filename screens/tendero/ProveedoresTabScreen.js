import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { ProveedoresMaestro, RelacionesExt, SugerenciasCambio, SugerenciasCambioExt, ProveedoresRecomendados } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

const ETIQUETAS_SUG = { pendiente: 'Pendiente', aprobada: 'Aprobado', rechazada: 'Rechazado' };

export default function ProveedoresTabScreen({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};
  const [relacionesLista, setRelacionesLista] = useState([]);
  const [todosLosProveedores, setTodosLosProveedores] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [busquedaAgregar, setBusquedaAgregar] = useState('');
  const [seleccionadosParaAgregar, setSeleccionadosParaAgregar] = useState([]);
  const [proveedoresDelBarrio, setProveedoresDelBarrio] = useState([]);
  const [guardandoSeleccion, setGuardandoSeleccion] = useState(false);

  const [editandoContactoId, setEditandoContactoId] = useState(null);
  const [telefonoContactoValor, setTelefonoContactoValor] = useState('');

  const [proponiendoId, setProponiendoId] = useState(null);
  const [telefonoPropuestaValor, setTelefonoPropuestaValor] = useState('');

  useEffect(() => { cargar(); }, [comercioId]);

  async function cargar() {
    if (!comercioId) return;
    try {
      const relaciones = await RelacionesExt.listarPorComercio(comercioId);
      const todos = await ProveedoresMaestro.listar();
      const sugs = await SugerenciasCambioExt.listarPorComercio(comercioId);
      setTodosLosProveedores(todos);
      setSugerencias(sugs);
      setRelacionesLista(
        relaciones
          .map((r) => ({ relacion: r, proveedor: todos.find((p) => p.id === r.proveedor_id) }))
          .filter((x) => x.proveedor)
      );

      // RPC (Fase 3): devuelve solo los proveedor_id de otros comercios del mismo
      // barrio, sin exponer sus filas — RLS ya no permite leerlas directo.
      const idsProveedoresDelBarrio = await ProveedoresRecomendados.porBarrio(comercioId);
      setProveedoresDelBarrio(idsProveedoresDelBarrio);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  function toggleSeleccionParaAgregar(id) {
    setSeleccionadosParaAgregar((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function confirmarAgregarSeleccionados() {
    if (seleccionadosParaAgregar.length === 0) return;
    setGuardandoSeleccion(true);
    try {
      for (const proveedorId of seleccionadosParaAgregar) {
        await RelacionesExt.crear({ comercio_id: comercioId, proveedor_id: proveedorId });
      }
      setMostrarAgregar(false);
      setSeleccionadosParaAgregar([]);
      setBusquedaAgregar('');
      cargar();
    } catch (e) {
      Alert.alert('Error vinculando', e.message);
    } finally {
      setGuardandoSeleccion(false);
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

  async function enviarPropuesta(proveedor) {
    if (!telefonoPropuestaValor.trim()) return;
    try {
      const creada = await SugerenciasCambio.crear({
        proveedor_id: proveedor.id,
        comercio_id: comercioId,
        telefono_sugerido: telefonoPropuestaValor,
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

  const idsVinculados = relacionesLista.map((x) => x.proveedor.id);
  const disponibles = todosLosProveedores
    .filter((p) => !idsVinculados.includes(p.id))
    .filter((p) => p.nombre.toLowerCase().includes(busquedaAgregar.toLowerCase()));

  const disponiblesDelBarrio = disponibles
    .filter((p) => proveedoresDelBarrio.includes(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const disponiblesOtros = disponibles
    .filter((p) => !proveedoresDelBarrio.includes(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  function renderProveedorSeleccionable(item) {
    const activo = seleccionadosParaAgregar.includes(item.id);
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemPicker, activo && styles.itemPickerActivo]}
        onPress={() => toggleSeleccionParaAgregar(item.id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNombre}>{item.nombre}</Text>
          <Text style={styles.itemSub}>{item.categoria || 'Sin categoría'}</Text>
        </View>
        <View style={[styles.check, activo && styles.checkActivo]}>
          {activo && <Text style={styles.checkTexto}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={styles.titulo}>Proveedores</Text>
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
              <View style={styles.sugerenciaFila}>
                <Text style={styles.sugerenciaTexto}>Enviado a actualización: {sugerencia.telefono_sugerido}</Text>
                <View style={[styles.pillEstado, styles[`pill_${sugerencia.estado}`]]}>
                  <Text style={styles.pillEstadoTexto}>{ETIQUETAS_SUG[sugerencia.estado]}</Text>
                </View>
              </View>
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
          </View>
        );
      })}

      {!mostrarAgregar ? (
        <TouchableOpacity style={styles.boton} onPress={() => setMostrarAgregar(true)}>
          <Text style={styles.botonTexto}>+ Agregar proveedor de Compi</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.panelAgregar}>
          <Text style={styles.label}>Marca los que quieras agregar</Text>
          <TextInput style={styles.buscador} placeholder="Buscar..." value={busquedaAgregar} onChangeText={setBusquedaAgregar} />

          {disponiblesDelBarrio.length > 0 && (
            <>
              <Text style={styles.subLabel}>Usados por tiendas de tu barrio</Text>
              {disponiblesDelBarrio.map(renderProveedorSeleccionable)}
            </>
          )}

          <Text style={styles.subLabel}>Otros proveedores en Compi</Text>
          {disponiblesOtros.length > 0 ? disponiblesOtros.map(renderProveedorSeleccionable) : (
            <Text style={styles.vacio}>No hay más proveedores para agregar</Text>
          )}

          <View style={styles.filaBotonesFinal}>
            <TouchableOpacity
              style={[styles.botonGuardarSeleccion, (seleccionadosParaAgregar.length === 0 || guardandoSeleccion) && { opacity: 0.4 }]}
              disabled={seleccionadosParaAgregar.length === 0 || guardandoSeleccion}
              onPress={confirmarAgregarSeleccionados}
            >
              <Text style={styles.botonTexto}>
                {guardandoSeleccion ? 'Guardando...' : `Guardar (${seleccionadosParaAgregar.length})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonCancelar} onPress={() => { setMostrarAgregar(false); setSeleccionadosParaAgregar([]); }}>
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  subLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  tocable: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  avisoTexto: { fontSize: 10, color: COLORS.textSecondary, marginTop: 8 },
  linkTexto: { fontSize: 11, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
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
  boton: { marginTop: 10, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  panelAgregar: { marginTop: 10 },
  itemPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  itemPickerActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkTexto: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  filaBotonesFinal: { marginTop: 10 },
  botonGuardarSeleccion: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonCancelar: { marginTop: 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  botonCancelarTexto: { color: COLORS.textSecondary, fontSize: 13 },
});