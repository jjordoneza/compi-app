import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { ComerciosExt, SugerenciasCambioComercioExt } from '../../supabase';
import { usuarioActual } from '../../auth';
import { useComercioActual } from '../../comercioActual';
import { COLORS, RADIUS } from '../../theme';

// Edición del propio negocio del tendero — distinta de screens/MiNegocioScreen.js
// (esa es una herramienta de admin que lista/crea/borra TODOS los comercios).
// Esta pantalla solo lee y edita el comercioId del tendero logueado.
export default function MiNegocioTenderoScreen({ route, navigation }) {
  const { comercioId } = route.params;
  const { setComercioActual } = useComercioActual();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [detalles, setDetalles] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  // Solo el teléfono de contacto pasa por aprobación admin
  // (sugerencias_cambio_comercio) — el resto, incluido nombre de quien
  // atiende, es autoservicio directo.
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

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await ComerciosExt.actualizar(comercioId, {
        nombre: nombre.trim(),
        ciudad: ciudad.trim() || null,
        barrio: barrio.trim(),
        direccion: direccion.trim() || null,
        detalles: detalles.trim() || null,
        contacto_nombre: contactoNombre.trim() || null,
      });

      const telefonoCambio = telefono.trim() !== (telefonoOriginal || '');
      if (telefonoCambio) {
        await SugerenciasCambioComercioExt.crear({
          comercio_id: comercioId,
          sugerido_por: usuarioActual()?.id || null,
          telefono_sugerido: telefono.trim(),
        });
      }

      // Actualiza el Context ya mismo — así Inicio y Perfil muestran el nombre
      // nuevo sin necesidad de que esas tabs vuelvan a tener foco.
      setComercioActual({ comercioNombre: nombre.trim() });

      if (telefonoCambio) {
        Alert.alert(
          'Guardado',
          'Tus datos se actualizaron. El cambio de teléfono de contacto quedó enviado a revisión.',
          [{ text: 'Entendido', onPress: () => navigation.navigate('Home', { screen: 'PerfilTab', params: { comercioId, comercioNombre: nombre.trim() } }) }]
        );
      } else {
        navigation.navigate('Home', { screen: 'PerfilTab', params: { comercioId, comercioNombre: nombre.trim() } });
      }
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
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.titulo}>Editar mi negocio</Text>
        <Text style={styles.subtitulo}>Estos datos son solo tuyos, ajústalos cuando quieras.</Text>

        <Text style={styles.label}>Nombre del negocio</Text>
        <TextInput style={styles.input} placeholder="Ej. Tienda Juan" value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Ciudad</Text>
        <TextInput style={styles.input} placeholder="Ej. Bogotá" value={ciudad} onChangeText={setCiudad} />

        <Text style={styles.label}>Barrio</Text>
        <TextInput style={styles.input} placeholder="Ej. La América" value={barrio} onChangeText={setBarrio} />

        <Text style={styles.label}>Dirección</Text>
        <TextInput style={styles.input} placeholder="Ej. Cra 45 #12-30" value={direccion} onChangeText={setDireccion} />

        <Text style={styles.label}>Detalles de ubicación</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Apto 302, Torre B, Urb. Los Robles"
          value={detalles}
          onChangeText={setDetalles}
        />

        <Text style={styles.label}>Nombre de quien atiende</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Juan Pérez"
          value={contactoNombre}
          onChangeText={setContactoNombre}
        />

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
          style={[styles.boton, (!nombre.trim() || guardando) && styles.botonDeshabilitado]}
          disabled={!nombre.trim() || guardando}
          onPress={guardar}
        >
          <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, marginTop: 8 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 6 },
  aviso: { fontSize: 12, color: COLORS.textSecondary, backgroundColor: COLORS.white, borderRadius: RADIUS.sm, padding: 10, marginTop: 8, lineHeight: 17 },
  boton: { marginTop: 20, height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
});
