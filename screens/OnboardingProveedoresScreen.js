import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RelacionesExt, ProveedoresMaestro, ProductosRelacionExt } from '../supabase';
import { COLORS, RADIUS } from '../theme';

// Pantalla 27 — Loop de onboarding: arma el catálogo de cada proveedor, uno a uno.
// "Terminar por ahora" siempre disponible; los proveedores sin catálogo quedan
// pendientes y reaparecen (ver tarjeta de la pantalla 28 en el Home).
export default function OnboardingProveedoresScreen({ route, navigation }) {
  const { comercioId, comercioNombre } = route.params;
  const [pendientes, setPendientes] = useState(null); // relaciones sin catálogo aún
  const [total, setTotal] = useState(0);
  const [saltados, setSaltados] = useState([]); // ocultos solo en esta sesión
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const rels = await RelacionesExt.listarPorComercio(comercioId);
      const provs = await ProveedoresMaestro.listar();
      const catalogos = await Promise.all(rels.map((r) => ProductosRelacionExt.listarPorRelacion(r.id)));
      const sinCatalogo = rels
        .map((r, i) => ({ rel: r, prov: provs.find((p) => p.id === r.proveedor_id), items: catalogos[i].length }))
        .filter((x) => x.items === 0);
      setTotal(rels.length);
      setPendientes(sinCatalogo);
    } catch (e) {
      setError(e.message);
    }
  }, [comercioId]);

  // Al volver de PegarPedido o de RelacionDetalle (alta manual), recarga para que
  // el proveedor recién catalogado salga de la lista.
  useFocusEffect(
    useCallback(() => {
      setPendientes(null);
      cargar();
    }, [cargar])
  );

  function irAHome() {
    navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] });
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.titulo}>No pudimos cargar tus proveedores</Text>
        <Text style={styles.subtitulo}>{error}</Text>
        <TouchableOpacity style={styles.boton} onPress={cargar}>
          <Text style={styles.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonSecundario} onPress={irAHome}>
          <Text style={styles.botonSecundarioTexto}>Terminar por ahora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (pendientes === null) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const visibles = pendientes.filter((x) => !saltados.includes(x.rel.id));

  if (visibles.length === 0) {
    return (
      <View style={styles.centrado}>
        <View style={styles.check}><Text style={styles.checkTexto}>✓</Text></View>
        <Text style={styles.titulo}>¡Listo por ahora!</Text>
        <Text style={styles.subtitulo}>
          Ya organizaste tus proveedores. Puedes armar más catálogos cuando quieras desde la pestaña Proveedores.
        </Text>
        <TouchableOpacity style={styles.boton} onPress={irAHome}>
          <Text style={styles.botonTexto}>Ir al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const actual = visibles[0];
  const hechos = total - visibles.length;

  return (
    <View style={styles.container}>
      <Text style={styles.progreso}>Proveedor {hechos + 1} de {total}</Text>
      <Text style={styles.titulo}>¿Qué le compras a {actual.prov?.nombre || 'este proveedor'}?</Text>
      <Text style={styles.subtitulo}>
        Pega un pedido viejo de WhatsApp y armamos su catálogo automáticamente, o agrégalo tú mismo si prefieres.
      </Text>

      <TouchableOpacity
        style={styles.boton}
        onPress={() =>
          navigation.navigate('PegarPedido', {
            comercioId,
            comercioNombre,
            relacionId: actual.rel.id,
            proveedorNombre: actual.prov?.nombre || 'Proveedor',
          })
        }
      >
        <Text style={styles.botonTexto}>Armar su catálogo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.botonSecundario}
        onPress={() =>
          navigation.navigate('RelacionDetalle', {
            relacionId: actual.rel.id,
            proveedorNombre: actual.prov?.nombre || 'Proveedor',
          })
        }
      >
        <Text style={styles.botonSecundarioTexto}>Agregar productos manualmente</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.saltarBoton}
        onPress={() => setSaltados((prev) => [...prev, actual.rel.id])}
      >
        <Text style={styles.saltarTexto}>Saltar este proveedor</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.terminar} onPress={irAHome}>
        <Text style={styles.terminarTexto}>Terminar por ahora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 70, paddingHorizontal: 26 },
  centrado: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  progreso: { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 8, marginBottom: 20, lineHeight: 18, textAlign: 'center' },
  boton: { marginTop: 12, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  botonSecundario: { marginTop: 10, height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonSecundarioTexto: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  saltarBoton: { marginTop: 14, height: 40, alignItems: 'center', justifyContent: 'center' },
  saltarTexto: { color: COLORS.textSecondary, fontSize: 13 },
  terminar: { marginTop: 4, height: 44, alignItems: 'center', justifyContent: 'center' },
  terminarTexto: { color: COLORS.textSecondary, fontSize: 13 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  checkTexto: { fontSize: 28, color: COLORS.success, fontWeight: '700' },
});
