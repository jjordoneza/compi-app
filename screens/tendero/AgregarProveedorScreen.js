import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProveedoresMaestro, RelacionesExt, CoberturaProveedor } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const UMBRAL_COBERTURA = 0.3; // por debajo de esto no se destaca como "cubre tu zona" — sigue disponible igual

// "Otros proveedores" (los que no tienen cobertura confirmada) se acota a
// Medellín y municipios aledaños para no abrumar con proveedores de otras
// ciudades. Un proveedor sin `ciudad` definida en el Maestro (dato admin
// nuevo, todavía sin backfill) sigue apareciendo — no hay forma de saber si
// aplica el filtro, así que no se oculta por falta de dato.
const MUNICIPIOS_AREA_METROPOLITANA = ['medellín', 'medellin', 'sabaneta', 'bello', 'la estrella', 'caldas', 'barbosa', 'girardota'];

export default function AgregarProveedorScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { comercioId } = route.params;
  const [cargando, setCargando] = useState(true);
  const [todosLosProveedores, setTodosLosProveedores] = useState([]);
  const [relacionesTodas, setRelacionesTodas] = useState([]); // incl. inactivas, para reactivar en vez de duplicar
  const [cobertura, setCobertura] = useState({}); // proveedor_id -> { confianza, fuente, diaSemanaDominante }
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [alturaFooter, setAlturaFooter] = useState(90);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [todos, relaciones, coberturaFilas] = await Promise.all([
        ProveedoresMaestro.listar(),
        RelacionesExt.listarPorComercio(comercioId),
        // Motor de confianza de cobertura (ver supabase/migrations 0009/0010):
        // infiere dónde entrega cada proveedor a partir de relaciones activas
        // + entregas reales, sin pedirle nada a nadie. Si un proveedor no
        // aparece o falla la carga, sigue disponible igual — nunca bloquea.
        CoberturaProveedor.confianza(comercioId).catch(() => []),
      ]);
      setTodosLosProveedores(todos);
      setRelacionesTodas(relaciones);
      const mapa = {};
      (coberturaFilas || []).forEach((fila) => {
        mapa[fila.proveedor_id] = {
          confianza: Number(fila.confianza) || 0,
          fuente: fila.fuente,
          diaSemanaDominante: fila.dia_semana_dominante,
        };
      });
      setCobertura(mapa);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  function toggleSeleccionado(id) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function confirmarAgregar() {
    if (seleccionados.length === 0 || guardando) return;
    setGuardando(true);
    try {
      for (const proveedorId of seleccionados) {
        // Si ya lo habías eliminado antes (y quedó desactivado, no borrado), lo
        // reactivamos en vez de crear una relación duplicada — conserva su
        // historial y precios viejos.
        const inactiva = relacionesTodas.find((r) => r.proveedor_id === proveedorId && !r.activo);
        if (inactiva) {
          await RelacionesExt.actualizar(inactiva.id, { activo: true });
        } else {
          await RelacionesExt.crear({ comercio_id: comercioId, proveedor_id: proveedorId });
        }
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error vinculando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  const idsActivos = relacionesTodas.filter((r) => r.activo).map((r) => r.proveedor_id);
  const disponibles = todosLosProveedores
    .filter((p) => !idsActivos.includes(p.id))
    .filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const disponiblesDelBarrio = disponibles
    .filter((p) => (cobertura[p.id]?.confianza || 0) >= UMBRAL_COBERTURA)
    .sort((a, b) => (cobertura[b.id]?.confianza || 0) - (cobertura[a.id]?.confianza || 0));
  const disponiblesOtros = disponibles
    .filter((p) => (cobertura[p.id]?.confianza || 0) < UMBRAL_COBERTURA)
    .filter((p) => !p.ciudad || MUNICIPIOS_AREA_METROPOLITANA.includes(p.ciudad.trim().toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  function renderProveedor(item) {
    const activo = seleccionados.includes(item.id);
    const info = cobertura[item.id];
    const cubreZona = (info?.confianza || 0) >= UMBRAL_COBERTURA;
    const diaTexto = info?.diaSemanaDominante != null ? DIAS[info.diaSemanaDominante] : null;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemPicker, activo && styles.itemPickerActivo]}
        onPress={() => toggleSeleccionado(item.id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNombre}>{item.nombre}</Text>
          <Text style={styles.itemSub}>{item.categoria || 'Sin categoría'}</Text>
          {(item.barrio || item.ciudad) && (
            <Text style={styles.itemUbicacion}>{[item.barrio, item.ciudad].filter(Boolean).join(', ')}</Text>
          )}
          {cubreZona && <Text style={styles.badgeCobertura}>📍 Cubre tu zona</Text>}
          {diaTexto && <Text style={styles.badgeDia}>Suele entregar los {diaTexto} en tu zona</Text>}
        </View>
        <View style={[styles.check, activo && styles.checkActivo]}>
          {activo && <Text style={styles.checkTexto}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  if (cargando) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitulo}>Cargando catálogo de proveedores...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: (seleccionados.length > 0 ? alturaFooter : 24) + insets.bottom }}
      >
        <Text style={styles.titulo}>Agregar proveedor</Text>
        <Text style={styles.subtitulo}>Elige uno o varios del catálogo de Compi para vincularlos a tu negocio</Text>

        <TextInput style={styles.buscador} placeholder="Buscar proveedor..." value={busqueda} onChangeText={setBusqueda} />

        {disponiblesDelBarrio.length > 0 && (
          <>
            <Text style={styles.subLabel}>Con cobertura en tu zona</Text>
            {disponiblesDelBarrio.map(renderProveedor)}
          </>
        )}

        <Text style={styles.subLabel}>Otros proveedores en Compi</Text>
        {disponiblesOtros.length > 0 ? disponiblesOtros.map(renderProveedor) : (
          <Text style={styles.vacio}>No hay más proveedores para agregar</Text>
        )}
      </ScrollView>

      {seleccionados.length > 0 && (
        <View
          style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
          onLayout={(e) => setAlturaFooter(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            style={[styles.botonGuardar, guardando && { opacity: 0.5 }]}
            disabled={guardando}
            onPress={confirmarAgregar}
          >
            <Text style={styles.botonTexto}>
              {guardando ? 'Guardando...' : `Agregar (${seleccionados.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  buscador: { height: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 14 },
  subLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  itemPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  itemPickerActivo: { backgroundColor: COLORS.successBg, borderColor: COLORS.primary },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  itemUbicacion: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  badgeCobertura: { fontSize: 11, color: COLORS.success, fontWeight: '600', marginTop: 4 },
  badgeDia: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkTexto: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 8, marginBottom: 8, fontSize: 12 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, padding: 16 },
  botonGuardar: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
});
