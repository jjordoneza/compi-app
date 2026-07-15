import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { cargarSesion, haySesion, usuarioActual } from '../auth';
import { MisComercios } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function SplashScreen({ navigation }) {
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    restaurar();
  }, []);

  async function restaurar() {
    try {
      await cargarSesion();
      if (!haySesion()) {
        setVerificando(false);
        return;
      }
      // Sesión válida: rutea directo según los comercios del usuario.
      const comercios = await MisComercios.listar();
      if (comercios.length === 0) {
        navigation.replace('RegistroNegocio', { telefono: usuarioActual()?.phone || '' });
      } else if (comercios.length === 1) {
        navigation.replace('Home', { comercioId: comercios[0].id, comercioNombre: comercios[0].nombre });
      } else {
        navigation.replace('SeleccionarNegocio');
      }
    } catch (e) {
      setVerificando(false); // ante cualquier problema, deja entrar por el flujo normal
    }
  }

  if (verificando) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>compi</Text>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

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
