import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProveedoresMaestro, ProveedoresSugeridos } from '../../supabase';
import { usuarioActual } from '../../auth';
import { COLORS, RADIUS } from '../../theme';

function normalizarTexto(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

// Celular colombiano: 10 dígitos exactos, empieza en 3 (mismo criterio que
// ProveedoresTabScreen al proponer cambio de número).
function telefonoValido(texto) {
  const soloDigitos = texto.replace(/\D/g, '');
  return /^3\d{9}$/.test(soloDigitos);
}

export default function CrearProveedorScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const [alturaFooter, setAlturaFooter] = useState(90);
  const { comercioId } = route.params;

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [telefonoSecundario, setTelefonoSecundario] = useState('');
  const [barrio, setBarrio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [todosLosProveedores, setTodosLosProveedores] = useState([]);

  useEffect(() => {
    // Catálogo completo, solo para el chequeo de duplicados antes de enviar —
    // mismo patrón de carga que AgregarProveedorScreen.
    ProveedoresMaestro.listar().then(setTodosLosProveedores).catch(() => {});
  }, []);

  const formCompleto = nombre.trim() && telefonoValido(telefono);

  // Bloqueo inteligente: si el celular o la dirección ya coinciden con un
  // proveedor del Maestro, es casi seguro que ya existe — mejor mandar al
  // tendero a "Agregar proveedor" a buscarlo que crear un duplicado que el
  // admin tenga que fusionar después.
  function encontrarDuplicado() {
    const telefonoDigitos = telefono.replace(/\D/g, '');
    const direccionNorm = normalizarTexto(direccion);
    return todosLosProveedores.find((p) => {
      const coincideTelefono =
        telefonoDigitos.length === 10 &&
        ((p.telefono || '').replace(/\D/g, '') === telefonoDigitos ||
          (p.telefono_secundario || '').replace(/\D/g, '') === telefonoDigitos);
      const coincideDireccion =
        direccionNorm.length > 4 && normalizarTexto(p.direccion) === direccionNorm;
      return coincideTelefono || coincideDireccion;
    });
  }

  async function crear() {
    if (!formCompleto || guardando) return;

    const duplicado = encontrarDuplicado();
    if (duplicado) {
      Alert.alert(
        'Este proveedor ya existe en Compi',
        `Encontramos a "${duplicado.nombre}" con el mismo celular o dirección. Agrégalo desde "Agregar proveedor" en vez de crear uno nuevo — así no se duplica el catálogo.`,
        [{ text: 'Entendido' }]
      );
      return;
    }

    setGuardando(true);
    try {
      await ProveedoresSugeridos.crear({
        comercio_id: comercioId,
        sugerido_por: usuarioActual()?.id || null,
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        canal: 'creado_directo',
        telefono: telefono.replace(/\D/g, ''),
        contacto_nombre: contactoNombre.trim() || null,
        telefono_secundario: telefonoSecundario.trim() || null,
        barrio: barrio.trim() || null,
        ciudad: ciudad.trim() || null,
        direccion: direccion.trim() || null,
        estado: 'pendiente',
      });
      Alert.alert(
        'Enviado a revisión',
        'Compi revisa este proveedor antes de dejarlo disponible — te avisamos apenas quede listo.',
        [{ text: 'Entendido', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error enviando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: alturaFooter + insets.bottom + 20 }}
        >
          <Text style={styles.titulo}>Crear proveedor nuevo</Text>
          <Text style={styles.subtitulo}>
            ¿Ya buscaste y no está en la lista? Cuéntanos de él y lo revisamos para dejarlo disponible.
          </Text>

          <Text style={styles.label}>Nombre del proveedor</Text>
          <TextInput style={styles.input} placeholder="Ej. Distribuidora La 70" value={nombre} onChangeText={setNombre} />

          <Text style={styles.label}>Categoría</Text>
          <TextInput style={styles.input} placeholder="Ej. Bebidas, aseo, granos..." value={categoria} onChangeText={setCategoria} />

          <Text style={styles.label}>Celular del proveedor</Text>
          <TextInput
            style={styles.input}
            placeholder="300 000 0000"
            keyboardType="phone-pad"
            value={telefono}
            onChangeText={setTelefono}
          />

          <Text style={styles.label}>Nombre de quien atiende (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. Carlos Gómez" value={contactoNombre} onChangeText={setContactoNombre} />

          <Text style={styles.label}>Segundo celular (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="300 000 0000"
            keyboardType="phone-pad"
            value={telefonoSecundario}
            onChangeText={setTelefonoSecundario}
          />

          <Text style={styles.label}>Ciudad (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. Medellín" value={ciudad} onChangeText={setCiudad} />

          <Text style={styles.label}>Barrio (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. Belén" value={barrio} onChangeText={setBarrio} />

          <Text style={styles.label}>Dirección (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. Cra 70 #45-12" value={direccion} onChangeText={setDireccion} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
        onLayout={(e) => setAlturaFooter(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={[styles.boton, (!formCompleto || guardando) && styles.botonDeshabilitado]}
          disabled={!formCompleto || guardando}
          onPress={crear}
        >
          <Text style={styles.botonTexto}>{guardando ? 'Enviando...' : 'Enviar a revisión'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 16 },
  boton: { backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.bg, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight },
});
