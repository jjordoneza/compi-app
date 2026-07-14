import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput } from 'react-native';
import { COLORS, RADIUS } from '../theme';

export default function LoginScreen({ navigation }) {
  const [celular, setCelular] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>compi</Text>
      <Text style={styles.titulo}>Ingresa a Compi</Text>
      <Text style={styles.subtitle}>Usa tu número de celular para entrar o crear tu cuenta.</Text>

      <TextInput
        style={styles.input}
        placeholder="300 123 4567"
        keyboardType="phone-pad"
        value={celular}
        onChangeText={setCelular}
      />

      <TouchableOpacity
        style={[styles.boton, !celular.trim() && styles.botonDeshabilitado]}
        disabled={!celular.trim()}
        onPress={() => navigation.navigate('Verificacion', { telefono: celular.trim() })}
      >
        <Text style={styles.botonTexto}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, paddingTop: 80, paddingHorizontal: 26 },
  brand: { fontSize: 18, fontWeight: '600', color: COLORS.primary, marginBottom: 36 },
  titulo: { fontSize: 24, fontWeight: '600', color: COLORS.text },
  subtitle: { marginTop: 10, fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  input: { marginTop: 26, height: 52, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 16, fontSize: 15, color: COLORS.text },
  boton: { marginTop: 20, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});