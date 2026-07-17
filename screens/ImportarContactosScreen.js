import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Contacts from 'expo-contacts';
import { ProveedoresSugeridos } from '../supabase';
import { usuarioActual } from '../auth';
import { detectarProveedores } from '../ai';
import { COLORS, RADIUS } from '../theme';

// Un teléfono puede tener cientos de contactos; acotamos lo que mandamos al LLM.
const MAX_CONTACTOS = 200;

export default function ImportarContactosScreen({ route, navigation }) {
  const { comercioId, comercioNombre } = route.params;
  const [analizando, setAnalizando] = useState(true);
  const [error, setError] = useState(null);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [resultados, setResultados] = useState([]); // [{nombre, esProveedor, categoria}]
  const [seleccionados, setSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { analizar(); }, []);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setPermisoDenegado(false);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermisoDenegado(true);
        return;
      }

      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name] });
      const nombres = [...new Set((data || []).map((c) => c.name).filter(Boolean))].slice(0, MAX_CONTACTOS);

      if (nombres.length === 0) {
        setResultados([]);
        setSeleccionados([]);
        return;
      }

      const detectados = await detectarProveedores(nombres);
      setResultados(detectados);
      // Preselecciona automáticamente los que la IA marcó como proveedor
      const indicesProveedores = detectados
        .map((d, i) => (d.esProveedor ? i : null))
        .filter((i) => i !== null);
      setSeleccionados(indicesProveedores);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalizando(false);
    }
  }

  function toggle(index) {
    setSeleccionados((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  }

  async function confirmarImportar() {
    if (seleccionados.length === 0) {
      navigation.replace('Home', { comercioId, comercioNombre });
      return;
    }
    setGuardando(true);
    // Copia marcada contacto por contacto a medida que se envía: si falla a
    // mitad de camino, un reintento solo procesa lo que falta en vez de volver
    // a enviar desde cero los que ya se guardaron (bug de duplicados encontrado
    // en la auditoría, mismo patrón que PegarPedidoScreen.js).
    const actualizados = [...resultados];
    try {
      // Fase 3: el tendero ya no crea proveedores_maestro directo — se propone
      // a la cola de curaduría (comparten identidad global entre todas las
      // tiendas, así que necesitan aprobación). El vínculo con este comercio se
      // crea recién cuando se aprueba, no antes.
      for (const i of seleccionados) {
        const contacto = actualizados[i];
        if (contacto._guardado) continue;
        await ProveedoresSugeridos.crear({
          comercio_id: comercioId,
          sugerido_por: usuarioActual()?.id || null,
          nombre: contacto.nombre,
          categoria: contacto.categoria === 'Otro' ? '' : contacto.categoria,
          canal: 'whatsapp',
          estado: 'pendiente',
        });
        actualizados[i] = { ...contacto, _guardado: true };
      }
      Alert.alert(
        'Enviado a revisión',
        `Enviamos ${seleccionados.length} proveedor(es) a revisión. En cuanto se aprueben, podrás armar su catálogo desde la pestaña Proveedores.`,
        [{ text: 'Entendido', onPress: () => navigation.replace('Home', { comercioId, comercioNombre }) }]
      );
    } catch (e) {
      setResultados(actualizados);
      Alert.alert('No terminamos de enviar todo', `${e.message}\n\nToca el botón otra vez — lo que ya se envió no se repite.`);
    } finally {
      setGuardando(false);
    }
  }

  if (analizando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.cargandoTexto}>Revisando tus contactos con IA...</Text>
      </View>
    );
  }

  if (permisoDenegado) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.errorTitulo}>Necesitamos ver tus contactos</Text>
        <Text style={styles.errorTexto}>
          Los usamos solo para ayudarte a marcar cuáles son proveedores. Puedes darnos permiso o seguir sin esto — lo agregas cuando quieras.
        </Text>
        <TouchableOpacity style={styles.boton} onPress={analizar}>
          <Text style={styles.botonTexto}>Dar permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => navigation.replace('Home', { comercioId, comercioNombre })}
        >
          <Text style={styles.botonSecundarioTexto}>Seguir sin esto</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.errorTitulo}>No pudimos analizar tus contactos</Text>
        <Text style={styles.errorTexto}>{error}</Text>
        <TouchableOpacity style={styles.boton} onPress={analizar}>
          <Text style={styles.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => navigation.replace('Home', { comercioId, comercioNombre })}
        >
          <Text style={styles.botonSecundarioTexto}>Omitir por ahora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (resultados.length === 0) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.errorTitulo}>No encontramos proveedores</Text>
        <Text style={styles.errorTexto}>
          No detectamos proveedores entre tus contactos. Puedes agregarlos a mano más tarde desde la pestaña Proveedores.
        </Text>
        <TouchableOpacity
          style={styles.boton}
          onPress={() => navigation.replace('Home', { comercioId, comercioNombre })}
        >
          <Text style={styles.botonTexto}>Continuar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Agreguemos tus proveedores</Text>
      <Text style={styles.subtitulo}>Nuestra IA revisó tus contactos y marcó los que parecen proveedores. Ajusta si algo no está bien.</Text>

      {resultados.map((contacto, i) => {
        const activo = seleccionados.includes(i);
        return (
          <TouchableOpacity
            key={i}
            style={[styles.item, activo && styles.itemActivo]}
            onPress={() => toggle(i)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{contacto.nombre.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemNombre}>{contacto.nombre}</Text>
              <Text style={styles.itemSub}>
                {contacto.esProveedor ? `IA detectó: ${contacto.categoria}` : 'IA: probablemente no es proveedor'}
              </Text>
            </View>
            <View style={[styles.check, activo && styles.checkActivo]}>
              {activo && <Text style={styles.checkTexto}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.5 }]} disabled={guardando} onPress={confirmarImportar}>
        <Text style={styles.botonTexto}>
          {guardando ? 'Guardando...' : `Agregar ${seleccionados.length} proveedor(es)`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, paddingTop: 70, paddingHorizontal: 24 },
  centrado: { flex: 1, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  cargandoTexto: { marginTop: 16, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  errorTitulo: { fontSize: 17, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  errorTexto: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 16, lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 0.5, borderColor: COLORS.border, borderRadius: RADIUS.md, marginBottom: 8, backgroundColor: COLORS.white },
  itemActivo: { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: COLORS.successBg },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkTexto: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  boton: { marginTop: 16, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  botonSecundario: { marginTop: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  botonSecundarioTexto: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
});