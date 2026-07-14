import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { SugerenciasCambioExt, SugerenciasCambio, ProveedoresMaestro, Comercios } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function SugerenciasCambioScreen() {
  const [sugerencias, setSugerencias] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [comercios, setComercios] = useState([]);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    try {
      const [sugs, provs, coms] = await Promise.all([
        SugerenciasCambioExt.listarPendientes(),
        ProveedoresMaestro.listar(),
        Comercios.listar(),
      ]);
      setSugerencias(sugs);
      setProveedores(provs);
      setComercios(coms);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  function confirmarAprobar(sug, proveedor) {
    Alert.alert(
      'Aprobar cambio',
      `¿Actualizar el teléfono de "${proveedor?.nombre}" a "${sug.telefono_sugerido}" para TODAS las tiendas que lo usan?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aprobar', onPress: () => aprobar(sug) },
      ]
    );
  }

  async function aprobar(sug) {
    try {
      await ProveedoresMaestro.actualizar(sug.proveedor_id, { telefono: sug.telefono_sugerido });
      await SugerenciasCambio.actualizar(sug.id, { estado: 'aprobada' });
      cargar();
    } catch (e) {
      Alert.alert('Error aprobando', e.message);
    }
  }

  async function rechazar(sug) {
    try {
      await SugerenciasCambio.actualizar(sug.id, { estado: 'rechazada' });
      cargar();
    } catch (e) {
      Alert.alert('Error rechazando', e.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Sugerencias de cambio de proveedores</Text>

      {sugerencias.length === 0 && <Text style={styles.vacio}>No hay sugerencias pendientes.</Text>}

      {sugerencias.map((sug) => {
        const proveedor = proveedores.find((p) => p.id === sug.proveedor_id);
        const comercio = comercios.find((c) => c.id === sug.comercio_id);
        return (
          <View key={sug.id} style={styles.card}>
            <Text style={styles.provNombre}>{proveedor?.nombre || 'Proveedor'}</Text>
            <Text style={styles.detalle}>Teléfono actual: {proveedor?.telefono || 'sin definir'}</Text>
            <Text style={styles.detalle}>Sugerido: {sug.telefono_sugerido}</Text>
            <Text style={styles.detalle}>Propuesto por: {comercio?.nombre || 'un negocio'}</Text>
            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.botonAprobar} onPress={() => confirmarAprobar(sug, proveedor)}>
                <Text style={styles.botonAprobarTexto}>Aprobar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonRechazar} onPress={() => rechazar(sug)}>
                <Text style={styles.botonRechazarTexto}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 14 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  provNombre: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  detalle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  filaBotones: { flexDirection: 'row', gap: 8, marginTop: 10 },
  botonAprobar: { backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.sm },
  botonAprobarTexto: { color: COLORS.white, fontWeight: '600', fontSize: 13 },
  botonRechazar: { backgroundColor: '#FBEAEA', paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.sm },
  botonRechazarTexto: { color: COLORS.error, fontWeight: '600', fontSize: 13 },
});