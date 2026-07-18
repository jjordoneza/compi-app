import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComerciosExt, SugerenciasCambioComercioExt } from '../../supabase';
import { usuarioActual } from '../../auth';
import { COLORS, RADIUS } from '../../theme';

const CATEGORIAS_LABEL = {
  tienda_barrio: 'Tienda de barrio',
  panaderia: 'Panadería',
  licorera: 'Licorera',
  minimarket: 'Minimarket',
  otro: 'Otro',
};

function CampoSoloLectura({ label, valor }) {
  return (
    <View style={styles.campoSoloLectura}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.valorSoloLectura}>{valor || '—'}</Text>
    </View>
  );
}

// Edición del propio negocio del tendero — distinta de screens/MiNegocioScreen.js
// (esa es una herramienta de admin que lista/crea/borra TODOS los comercios).
// Esta pantalla solo lee y edita el comercioId del tendero logueado.
//
// Decisión de producto (18 jul 2026): esta pantalla solo deja editar el
// teléfono de contacto. El resto de datos del negocio se muestra de solo
// lectura — para corregirlos hace falta el panel de admin (Maestro negocios).
export default function MiNegocioTenderoScreen({ route, navigation }) {
  const { comercioId } = route.params;
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [detalles, setDetalles] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [telefono, setTelefono] = useState('');
  const [telefonoOriginal, setTelefonoOriginal] = useState('');
  const [pendiente, setPendiente] = useState(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [filas, pendientes] = await Promise.all([
        ComerciosExt.listarPorId(comercioId),
        SugerenciasCambioComercioExt.listarPendientePorComercio(comercioId),
      ]);
      const comercio = filas?.[0];
      if (comercio) {
        setNombre(comercio.nombre || '');
        setCiudad(comercio.ciudad || '');
        setBarrio(comercio.barrio || '');
        setDireccion(comercio.direccion || '');
        setDetalles(comercio.detalles || '');
        setContactoNombre(comercio.contacto_nombre || '');
        setCategoria(comercio.categoria || '');
        setTelefono(comercio.telefono || '');
        setTelefonoOriginal(comercio.telefono || '');
      }
      setPendiente(pendientes?.[0] || null);
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    } finally {
      setCargando(false);
    }
  }

  const telefonoCambio = telefono.trim() !== (telefonoOriginal || '');

  function confirmarEliminar() {
    Alert.alert(
      'Eliminar perfil',
      `¿Eliminar "${nombre}"? Se quita de tu lista de negocios — tu historial de pedidos queda intacto por si lo necesitas después. Puedes seguir usando tus otros negocios si tienes más de uno.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: eliminarPerfil },
      ]
    );
  }

  async function eliminarPerfil() {
    setEliminando(true);
    try {
      await ComerciosExt.actualizar(comercioId, { activo: false });
      // Splash decide a dónde ir según cuántos comercios activos le quedan al
      // usuario (0 → registro, 1 → Home, 2+ → seleccionar) — reusa esa lógica
      // en vez de duplicarla aquí.
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    } catch (e) {
      Alert.alert('Error eliminando', e.message);
      setEliminando(false);
    }
  }

  async function guardar() {
    if (!telefonoCambio) return;
    setGuardando(true);
    try {
      await SugerenciasCambioComercioExt.crear({
        comercio_id: comercioId,
        sugerido_por: usuarioActual()?.id || null,
        telefono_sugerido: telefono.trim(),
      });
      Alert.alert(
        'Enviado a revisión',
        'El cambio de teléfono de contacto quedó enviado a revisión.',
        [{ text: 'Entendido', onPress: () => navigation.navigate('Home', { screen: 'PerfilTab', params: { comercioId, comercioNombre: nombre } }) }]
      );
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitulo}>Cargando...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <Text style={styles.titulo}>Mi negocio</Text>
        <Text style={styles.subtitulo}>Desde aquí solo puedes actualizar tu teléfono de contacto. Para corregir el resto de tus datos, contacta a soporte.</Text>

        <CampoSoloLectura label="Nombre del negocio" valor={nombre} />
        <CampoSoloLectura label="Ciudad" valor={ciudad} />
        <CampoSoloLectura label="Barrio" valor={barrio} />
        <CampoSoloLectura label="Dirección" valor={direccion} />
        <CampoSoloLectura label="Detalles de ubicación" valor={detalles} />
        <CampoSoloLectura label="Nombre de quien atiende" valor={contactoNombre} />
        <CampoSoloLectura label="Tipo de negocio" valor={CATEGORIAS_LABEL[categoria] || categoria} />

        <Text style={styles.label}>Teléfono de contacto</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 3001234567"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
        />

        {pendiente && (
          <Text style={styles.aviso}>
            Ya tienes un cambio de teléfono en revisión ({pendiente.telefono_sugerido}).
          </Text>
        )}

        <TouchableOpacity
          style={[styles.boton, (!telefonoCambio || guardando) && styles.botonDeshabilitado]}
          disabled={!telefonoCambio || guardando}
          onPress={guardar}
        >
          <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Guardar teléfono'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.botonEliminar, eliminando && styles.botonDeshabilitado]}
          disabled={eliminando}
          onPress={confirmarEliminar}
        >
          <Text style={styles.botonEliminarTexto}>{eliminando ? 'Eliminando...' : 'Eliminar perfil'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, marginTop: 8 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 6 },
  campoSoloLectura: { marginBottom: 4 },
  valorSoloLectura: { height: 48, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.textSecondary, backgroundColor: COLORS.bg, textAlignVertical: 'center', lineHeight: 48 },
  aviso: { fontSize: 12, color: COLORS.textSecondary, backgroundColor: COLORS.white, borderRadius: RADIUS.sm, padding: 10, marginTop: 8, lineHeight: 17 },
  boton: { marginTop: 20, height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  botonEliminar: { marginTop: 12, height: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  botonEliminarTexto: { color: COLORS.error, fontWeight: '600', fontSize: 15 },
});
