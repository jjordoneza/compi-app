import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Comercios } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function RegistroNegocioScreen({ route, navigation }) {
  const { telefono } = route.params;
  const [nombre, setNombre] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [detalles, setDetalles] = useState('');
  const [proveedoresTotales, setProveedoresTotales] = useState(5);
  const [guardando, setGuardando] = useState(false);

  function cambiarProveedoresTotales(delta) {
    setProveedoresTotales((prev) => Math.max(0, prev + delta));
  }

  async function continuar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      const creado = await Comercios.crear({
        nombre: nombre.trim(),
        barrio: barrio.trim(),
        direccion: direccion.trim() || null,
        detalles: detalles.trim() || null,
        telefono,
        proveedores_totales: proveedoresTotales,
      });
      const comercioId = creado[0].id;
      navigation.replace('ImportarContactos', { comercioId, comercioNombre: nombre.trim() });
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

        <Text style={styles.label}>Barrio</Text>
        <TextInput style={styles.input} placeholder="Ej. La América" value={barrio} onChangeText={setBarrio} />

        <Text style={styles.label}>Dirección (opcional)</Text>
        <TextInput style={styles.input} placeholder="Ej. Cra 45 #12-30" value={direccion} onChangeText={setDireccion} />

        <Text style={styles.label}>Detalles de ubicación (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Apto 302, Torre B, Urb. Los Robles"
          value={detalles}
          onChangeText={setDetalles}
        />

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
          style={[styles.boton, (!nombre.trim() || guardando) && styles.botonDeshabilitado]}
          disabled={!nombre.trim() || guardando}
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