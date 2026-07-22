import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Animated, Image } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { cargarSesion, haySesion, usuarioActual } from '../auth';
import { MisComercios } from '../supabase';
import { COLORS, RADIUS } from '../theme';

// Si restaurar() ni resuelve ni falla (red colgada, no un error real) en este
// tiempo, se deja de esperar y se entra por el flujo normal en vez de quedar
// con el spinner de arranque para siempre.
const TIMEOUT_RESTAURAR_MS = 8000;

// El splash nativo (estático, configurado vía el plugin expo-splash-screen en
// app.config.js) se queda visible hasta que se llame hideAsync() — así no hay
// pantalla en blanco entre que abre la app y que este componente monta.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function SplashScreen({ navigation }) {
  const [verificando, setVerificando] = useState(true);
  const opacidad = useRef(new Animated.Value(0)).current;
  const escala = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(opacidad, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(escala, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    let vencido = false; // true cuando ya se dejó de esperar (timeout o resuelto)
    restaurar(() => vencido);
    const timeout = setTimeout(() => {
      vencido = true;
      setVerificando(false);
    }, TIMEOUT_RESTAURAR_MS);
    return () => clearTimeout(timeout);
  }, []);

  async function restaurar(yaVencido) {
    try {
      await cargarSesion();
      if (yaVencido()) return; // el timeout ya mostró "Empezar"; no pisar esa pantalla
      if (!haySesion()) {
        setVerificando(false);
        return;
      }
      // Sesión válida: rutea directo según los comercios del usuario.
      const comercios = await MisComercios.listar();
      if (yaVencido()) return;
      if (comercios.length === 0) {
        // Antes de mandar a crear uno nuevo, reviso si tiene negocios
        // eliminados — si los tiene, SeleccionarNegocio se los muestra ahí
        // (sección "Negocios eliminados") en vez de perderlos de vista.
        const inactivos = await MisComercios.listarInactivos();
        if (yaVencido()) return;
        if (inactivos.length === 0) {
          navigation.replace('RegistroNegocio', { telefono: usuarioActual()?.phone || '' });
        } else {
          navigation.replace('SeleccionarNegocio');
        }
      } else if (comercios.length === 1) {
        navigation.replace('Home', { comercioId: comercios[0].id, comercioNombre: comercios[0].nombre });
      } else {
        navigation.replace('SeleccionarNegocio');
      }
    } catch (e) {
      if (!yaVencido()) setVerificando(false); // ante cualquier problema, deja entrar por el flujo normal
    }
  }

  const logoAnimado = (
    <Animated.View style={{ opacity: opacidad, transform: [{ scale: escala }] }}>
      <Image source={require('../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
    </Animated.View>
  );

  if (verificando) {
    return (
      <View style={styles.container}>
        {logoAnimado}
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {logoAnimado}
      <Text style={styles.subtitle}>Abastece tu negocio fácil</Text>
      <TouchableOpacity style={styles.boton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.botonTexto}>Empezar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  logo: { width: 220, aspectRatio: 1070 / 375 },
  subtitle: { marginTop: 12, fontSize: 14, color: COLORS.text },
  boton: { marginTop: 30, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: RADIUS.md },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
});
