import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Cuenta } from '../supabase';
import { verificarOTP } from '../auth';
import { COLORS, RADIUS } from '../theme';

export default function VerificacionScreen({ route, navigation }) {
  const { telefono } = route.params;
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);

  async function confirmar() {
    if (codigo.length < 6) return;
    setVerificando(true);
    try {
      await verificarOTP(telefono, codigo); // valida y deja la sesión activa

      // Engancha comercios sembrados que coincidan con este teléfono (mejor esfuerzo).
      try { await Cuenta.reclamarComercios(); } catch (e) { /* noop */ }

      // Splash centraliza todo el rutero post-login (gate de términos incluido,
      // luego comercios) — se reusa en vez de duplicarlo aquí.
      navigation.replace('Splash');
    } catch (e) {
      Alert.alert('Código incorrecto', e.message);
      setVerificando(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Confirma tu número</Text>
      <Text style={styles.subtitulo}>Te enviamos un código por SMS al {telefono}</Text>

      <TextInput
        style={styles.input}
        placeholder="Código de 6 dígitos"
        keyboardType="number-pad"
        maxLength={6}
        value={codigo}
        onChangeText={setCodigo}
      />

      <TouchableOpacity
        style={[styles.boton, (codigo.length < 6 || verificando) && styles.botonDeshabilitado]}
        disabled={codigo.length < 6 || verificando}
        onPress={confirmar}
      >
        <Text style={styles.botonTexto}>{verificando ? 'Verificando...' : 'Confirmar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, paddingTop: 80, paddingHorizontal: 26 },
  titulo: { fontSize: 22, fontWeight: '600', color: COLORS.text },
  subtitulo: { marginTop: 8, fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  avisoDemo: { marginTop: 20, backgroundColor: COLORS.warningBg, borderRadius: RADIUS.sm, padding: 12 },
  avisoDemoTexto: { fontSize: 12, color: COLORS.warning, lineHeight: 17 },
  input: { marginTop: 20, height: 52, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 16, fontSize: 15, color: COLORS.text, textAlign: 'center', letterSpacing: 6 },
  boton: { marginTop: 20, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});