import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Cuenta, ComerciosExt, ComercioPorTelefono } from '../supabase';
import { COLORS, RADIUS } from '../theme';
import { BARRIOS_MEDELLIN } from '../constants';

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

// Sugerencias de barrio mientras se escribe — solo para reducir variantes de
// escritura del mismo barrio (ayuda al matching del motor de cobertura). El
// campo sigue siendo texto libre: no se valida ni se bloquea contra la lista.
function SugerenciasBarrio({ texto, onSeleccionar }) {
  const q = texto.trim().toLowerCase();
  if (q.length < 2) return null;
  const sugerencias = BARRIOS_MEDELLIN.filter((b) => b.toLowerCase().includes(q) && b.toLowerCase() !== q).slice(0, 5);
  if (sugerencias.length === 0) return null;
  return (
    <View style={styles.sugerenciasFila}>
      {sugerencias.map((s) => (
        <TouchableOpacity key={s} style={styles.sugerenciaChip} onPress={() => onSeleccionar(s)}>
          <Text style={styles.sugerenciaChipTexto}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Nunca bloquea el registro: si el permiso se niega o la captura falla,
// devuelve null y el comercio simplemente queda sin coordenadas — el motor
// de cobertura de proveedores ya está diseñado para ese caso (cae a
// matching por barrio). El guardado real ya no pasa aquí — lo hace
// ConfirmarUbicacionScreen después de que el tendero confirme/ajuste el pin.
async function capturarUbicacion() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
  } catch (e) {
    return null; // silencioso a propósito
  }
}

export default function RegistroNegocioScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const [alturaFooter, setAlturaFooter] = useState(90);
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

  // Todos los campos son obligatorios (decisión de producto, 18 jul 2026)
  // excepto "Detalles de ubicación" (ajuste 19 jul 2026: vuelve a opcional,
  // es un complemento de la dirección, no siempre aplica).
  const formCompleto =
    nombre.trim() &&
    ciudad.trim() &&
    barrio.trim() &&
    direccion.trim() &&
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

    // Aviso de solo-lectura, nunca bloquea (gap P3 #7): si el teléfono ya es
    // de OTRO dueño, es casi seguro un duplicado real o alguien reclamando un
    // negocio ajeno por error — pero multi-comercio del mismo dueño (mismo
    // teléfono OTP en un 2º/3er negocio) es un caso legítimo, así que la RPC
    // ya excluye los comercios propios y esto nunca se dispara para ese caso.
    if (telefono) {
      try {
        const coincidencias = await ComercioPorTelefono.buscar(telefono);
        if (coincidencias && coincidencias.length > 0) {
          setGuardando(false);
          Alert.alert(
            '¿Es tu negocio?',
            `Ya existe un negocio registrado con este teléfono: "${coincidencias[0].nombre}". Si es el mismo negocio, pide a quien lo registró que te agregue como miembro en vez de crear uno nuevo. Si es un negocio distinto, puedes continuar.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Continuar de todas formas', onPress: crearComercioReal },
            ]
          );
          return;
        }
      } catch (e) {
        // No bloquea el registro por esto — mismo criterio que capturarUbicacion().
      }
    }

    await crearComercioReal();
  }

  async function crearComercioReal() {
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
      setComercioCreado({ id: comercio.id, nombre: nombre.trim() });
      const coords = await capturarUbicacion();
      // navigate (no replace): así "atrás" regresa aquí en vez de saltar a Login.
      if (coords) {
        navigation.navigate('ConfirmarUbicacion', {
          comercioId: comercio.id,
          comercioNombre: nombre.trim(),
          lat: coords.lat,
          lng: coords.lng,
        });
      } else {
        navigation.navigate('ImportarContactos', { comercioId: comercio.id, comercioNombre: nombre.trim() });
      }
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: 70, paddingHorizontal: 26, paddingBottom: alturaFooter + insets.bottom + 20 }}>
        <Text style={styles.titulo}>Cuéntanos de tu negocio</Text>
        <Text style={styles.subtitulo}>Así podemos ayudarte a organizar mejor tus pedidos.</Text>

        <Text style={styles.label}>Nombre del negocio</Text>
        <TextInput style={styles.input} placeholder="Ej. Tienda Juan" value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Ciudad</Text>
        <TextInput style={styles.input} placeholder="Ej. Bogotá" value={ciudad} onChangeText={setCiudad} />

        <Text style={styles.label}>Barrio</Text>
        <TextInput style={styles.input} placeholder="Ej. La América" value={barrio} onChangeText={setBarrio} />
        <SugerenciasBarrio texto={barrio} onSeleccionar={setBarrio} />

        <Text style={styles.label}>¿Cuál es la dirección de este negocio?</Text>
        <TextInput style={styles.input} placeholder="Ej. Cra 45 #12-30" value={direccion} onChangeText={setDireccion} />

        <Text style={styles.label}>Detalles de ubicación (opcional)</Text>
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
            <TextInput
              style={styles.stepperInput}
              keyboardType="number-pad"
              value={String(proveedoresTotales)}
              onChangeText={(texto) => {
                const numero = parseInt(texto.replace(/[^0-9]/g, ''), 10);
                setProveedoresTotales(Number.isNaN(numero) ? 0 : numero);
              }}
              selectTextOnFocus
            />
            <TouchableOpacity style={styles.stepperBoton} onPress={() => cambiarProveedoresTotales(1)}>
              <Text style={styles.stepperTexto}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
        onLayout={(e) => setAlturaFooter(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={[styles.boton, (!formCompleto || guardando) && styles.botonDeshabilitado]}
          disabled={!formCompleto || guardando}
          onPress={continuar}
        >
          <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Continuar'}</Text>
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
  chipsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  chipActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTexto: { fontSize: 13, color: COLORS.text },
  chipTextoActivo: { color: COLORS.white, fontWeight: '600' },
  sugerenciasFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -8, marginBottom: 16 },
  sugerenciaChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.borderLight },
  sugerenciaChipTexto: { fontSize: 12, color: COLORS.textSecondary },
  card: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: 16, marginTop: 6 },
  cardTitulo: { fontSize: 13, fontWeight: '600', color: '#27500A' },
  cardSubtitulo: { fontSize: 11, color: '#3B6D11', marginTop: 4, lineHeight: 15 },
  stepperFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 },
  stepperBoton: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  stepperTexto: { fontSize: 20, color: COLORS.primary, fontWeight: '600' },
  stepperNumero: { fontSize: 22, fontWeight: '700', color: COLORS.text, minWidth: 30, textAlign: 'center' },
  stepperInput: { fontSize: 22, fontWeight: '700', color: COLORS.text, minWidth: 60, textAlign: 'center', padding: 0 },
  boton: { backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.bg, paddingHorizontal: 26, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight },
});