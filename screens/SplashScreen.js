import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS } from '../theme';

export default function SplashScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>compi</Text>
      <Text style={styles.subtitle}>Abastece tu negocio fácil</Text>
      <TouchableOpacity style={styles.boton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.botonTexto}>Empezar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  logo: { fontSize: 44, fontWeight: '600', color: COLORS.primary, letterSpacing: -1 },
  subtitle: { marginTop: 12, fontSize: 14, color: COLORS.text },
  boton: { marginTop: 30, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: RADIUS.md },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});