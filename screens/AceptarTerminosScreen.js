import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { DocumentosLegales, Terminos } from '../supabase';
import { cerrarSesion } from '../auth';
import { COLORS, RADIUS } from '../theme';

// Gate obligatorio antes de entrar a la app (rutea acá SplashScreen cuando
// Terminos.pendientes() da true). El contenido se lee de documentos_legales
// (migración 0040), no está embebido en el bundle: así lo que el usuario ve
// acá es exactamente lo que terminos_aceptaciones va a registrar como
// aceptado — evidencia de autorización ante la Ley 1581 de 2012.
export default function AceptarTerminosScreen({ navigation }) {
  const [terminos, setTerminos] = useState(null);
  const [privacidad, setPrivacidad] = useState(null);
  const [error, setError] = useState(null);
  const [marcado, setMarcado] = useState(false);
  const [aceptando, setAceptando] = useState(false);

  useEffect(() => {
    Promise.all([DocumentosLegales.vigente('terminos'), DocumentosLegales.vigente('privacidad')])
      .then(([t, p]) => {
        if (!t || !p) throw new Error('No hay documentos legales vigentes');
        setTerminos(t);
        setPrivacidad(p);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function aceptar() {
    setAceptando(true);
    try {
      await Terminos.aceptar();
      navigation.replace('Splash');
    } catch (e) {
      Alert.alert('No pudimos guardar tu aceptación', e.message);
    } finally {
      setAceptando(false);
    }
  }

  function noAcepto() {
    Alert.alert(
      'Para usar Compi hace falta aceptar',
      'Sin aceptar los Términos de Uso y la Política de Privacidad no podemos darte acceso. Puedes cerrar sesión y volver cuando quieras.',
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
          await cerrarSesion();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        } },
      ]
    );
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.vacio}>No pudimos cargar los términos. Revisa tu conexión e intenta de nuevo.</Text>
      </View>
    );
  }

  if (!terminos || !privacidad) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Antes de empezar</Text>
      <Text style={styles.subtitulo}>Lee y acepta estos dos documentos para usar Compi.</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.seccionTitulo}>Términos de Uso</Text>
        <Text style={styles.contenido}>{terminos.contenido}</Text>

        <Text style={[styles.seccionTitulo, { marginTop: 24 }]}>Política de Privacidad</Text>
        <Text style={styles.contenido}>{privacidad.contenido}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.filaSwitch}>
          <Switch value={marcado} onValueChange={setMarcado} trackColor={{ true: COLORS.primary }} />
          <Text style={styles.switchTexto}>He leído y acepto los Términos de Uso y la Política de Privacidad</Text>
        </View>

        <TouchableOpacity
          style={[styles.boton, (!marcado || aceptando) && styles.botonDeshabilitado]}
          disabled={!marcado || aceptando}
          onPress={aceptar}
        >
          <Text style={styles.botonTexto}>{aceptando ? 'Guardando...' : 'Aceptar y continuar'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={noAcepto}>
          <Text style={styles.noAcepto}>No acepto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  centrado: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  scroll: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 16, borderWidth: 0.5, borderColor: COLORS.borderLight },
  seccionTitulo: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  contenido: { fontSize: 12.5, color: COLORS.text, lineHeight: 19 },
  footer: { paddingTop: 12, paddingBottom: 20 },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchTexto: { flex: 1, fontSize: 12.5, color: COLORS.text, lineHeight: 17 },
  boton: { marginTop: 14, height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  noAcepto: { marginTop: 14, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
