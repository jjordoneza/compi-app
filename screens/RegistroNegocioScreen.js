import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Cuenta, ComerciosExt } from '../supabase';
import { COLORS, RADIUS } from '../theme';

const CATEGORIAS = [
  { value: 'tienda_barrio', label: 'Tienda de barrio' },
  { value: 'panaderia', label: 'Panadería' },
  { value: 'licorera', label: 'Licorera' },
  { value: 'minimarket', label: 'Minimarket' },
  { value: 'otro', label: 'Otro' },
];

const CANALES_ADQUISICION = [
  { value: 'referido', label: 'Un conocido me contó' },
  { value: 'redes_sociales', label: 'Redes sociales' },
  { value: 'visita_directa', label: 'Alguien de Compi me visitó' },
  { value: 'otro', label: 'Otro' },
];

// Selección única con tap-para-deseleccionar: ambos grupos son opcionales, no
// se fuerza a elegir nada para continuar.
function ChipSelector({ opciones, valor, onCambiar }) {
  return (
    <View style={styles.chipsFila}>
      {opciones.map((op) => {
        const activo = valor === op.value;
        return (
          <TouchableOpacity
            key={op.value}
            style={[styles.chip, activo && styles.chipActivo]}
            onPress={() => onCambiar(activo ? '' : op.value)}
          >
            <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{op.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Sin pantalla propia, nunca bloquea el registro: si el permiso se niega o
// la captura falla, el comercio simplemente queda sin coordenadas — el motor
// de cobertura de proveedores ya está diseñado para ese caso (cae a
// matching por barrio). No se le muestra nada de esto al tendero.
async function capturarUbicacion(comercioId) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await ComerciosExt.actualizar(comercioId, {
      lat: posicion.coords.latitude,
      lng: posicion.coords.longitude,
    });
  } catch (e) {
    // Silencioso a propósito.
  }
}

export default function RegistroNegocioScreen({ route, navigation }) {
  const { telefono } = route.params;
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [detalles, setDetalles] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [canalAdquisicion, setCanalAdquisicion] = useState('');
  const [proveedoresTotales, setProveedoresTotales] = useState(5);
  const [guardando, setGuardando] = useState(false);
  // Si el tendero ya creó el comercio y usa "atrás" desde Importar contactos
  // para volver aquí, no se vuelve a crear otro — se re-navega con el mismo id.
  const [comercioCreado, setComercioCreado] = useState(null);

  function cambiarProveedoresTotales(delta) {
    setProveedoresTotales((prev) => Math.max(0, prev + delta));
  }

  // Todos los campos son obligatorios (decisión de producto, 18 jul 2026) —
  // antes solo el nombre lo era.
  const formCompleto =
    nombre.trim() &&
    ciudad.trim() &&
    barrio.trim() &&
    direccion.trim() &&
    detalles.trim() &&
    contactoNombre.trim() &&
    categoria &&
    canalAdquisicion;

  async function continuar() {
    if (!formCompleto) return;

    if (comercioCreado) {
      navigation.navigate('ImportarContactos', { comercioId: comercioCreado.id, comercioNombre: comercioCreado.nombre });
      return;
    }

    setGuardando(true);
    try {
      // RPC crear_comercio: crea el comercio y la membresía del usuario atómicamente.
      const creado = await Cuenta.crearComercio(
        nombre.trim(),
        barrio.trim(),
        telefono || null,
        proveedoresTotales,
        direccion.trim() || null,
        detalles.trim() || null,
        ciudad.trim() || null,
        contactoNombre.trim() || null
      );
      const comercio = Array.isArray(creado) ? creado[0] : creado;
      // categoria/canal_adquisicion no están en crear_comercio (evita cambiar su
      // firma por 2 campos opcionales) — se guardan con un PATCH aparte si el
      // tendero eligió alguno.
      if (categoria || canalAdquisicion) {
        await ComerciosExt.actualizar(comercio.id, {
          categoria: categoria || null,
          canal_adquisicion: canalAdquisicion || null,
        });
      }
      capturarUbicacion(comercio.id); // sin await: no debe demorar la navegación
      setComercioCreado({ id: comercio.id, nombre: nombre.trim() });
      // navigate (no replace): así "atrás" desde Importar contactos regresa
      // aquí en vez de saltar a la pantalla de login.
      navigation.navigate('ImportarContactos', { comercioId: comercio.id, comercioNombre: nombre.trim() });
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 26, paddingBottom: 40 }}>
        <Text style={styles.titulo}>Cuéntanos de tu negocio</Text>
        <Text style={styles.subtitulo}>Así podemos ayudarte a organizar mejor tus pedidos.</Text>

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

        <Text style={styles.label}>Tipo de negocio</Text>
        <ChipSelector opciones={CATEGORIAS} valor={categoria} onCambiar={setCategoria} />

        <Text style={[styles.label, { marginTop: 4 }]}>¿Cómo llegaste a Compi?</Text>
        <ChipSelector opciones={CANALES_ADQUISICION} valor={canalAdquisicion} onCambiar={setCanalAdquisicion} />

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>¿A cuántos proveedores le compras en total?</Text>
          <Text style={styles.cardSubtitulo}>Aunque no todos estén en Compi. Nos ayuda a entender tu negocio.</Text>
          <View style={styles.stepperFila}>
            <TouchableOpacity style={styles.stepperBoton} onPress={() => cambiarProveedoresTotales(-1)}>
              <Text style={styles.stepperTexto}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNumero}>{proveedoresTotales}</Text>
            <TouchableOpacity style={styles.stepperBoton} onPress={() => cambiarProveedoresTotales(1)}>
              <Text style={styles.stepperTexto}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.boton, (!formCompleto || guardando) && styles.botonDeshabilitado]}
          disabled={!formCompleto || guardando}
          onPress={continuar}
        >
          <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Continuar'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 16 },
  chipsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  chipActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTexto: { fontSize: 13, color: COLORS.text },
  chipTextoActivo: { color: COLORS.white, fontWeight: '600' },
  card: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: 16, marginTop: 6 },
  cardTitulo: { fontSize: 13, fontWeight: '600', color: '#27500A' },
  cardSubtitulo: { fontSize: 11, color: '#3B6D11', marginTop: 4, lineHeight: 15 },
  stepperFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 },
  stepperBoton: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  stepperTexto: { fontSize: 20, color: COLORS.primary, fontWeight: '600' },
  stepperNumero: { fontSize: 22, fontWeight: '700', color: COLORS.text, minWidth: 30, textAlign: 'center' },
  boton: { marginTop: 24, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});