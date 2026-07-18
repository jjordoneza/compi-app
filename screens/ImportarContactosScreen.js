import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import * as Contacts from 'expo-contacts';
import { ProveedoresSugeridos, ProveedoresSugeridosExt } from '../supabase';
import { usuarioActual } from '../auth';
import { detectarProveedores } from '../ai';
import { COLORS, RADIUS } from '../theme';

// Un teléfono puede tener cientos de contactos; acotamos lo que mandamos al LLM.
const MAX_CONTACTOS = 200;

function primerTelefono(contacto) {
  return contacto.phoneNumbers?.[0]?.number || null;
}

export default function ImportarContactosScreen({ route, navigation }) {
  const { comercioId, comercioNombre } = route.params;
  const [analizando, setAnalizando] = useState(true);
  const [error, setError] = useState(null);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  // Una vez el SO deja de mostrar el diálogo de permisos (denegado "para
  // siempre"), volver a llamar requestPermissionsAsync() no hace nada visible
  // — hay que mandar al usuario a Ajustes en vez de reintentar en el aire.
  const [permisoBloqueado, setPermisoBloqueado] = useState(false);
  const [resultados, setResultados] = useState([]); // [{nombre, esProveedor, categoria}]
  const [seleccionados, setSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  // Guarda qué índices ya se crearon con éxito, para que un reintento tras un
  // fallo a mitad de camino no vuelva a crear los mismos proveedores.
  const guardadosRef = useRef(new Set());
  // index -> teléfono del contacto (para el cruce de duplicados por
  // nombre+celular contra proveedores_maestro).
  const telefonosRef = useRef({});

  useEffect(() => { analizar(); }, []);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setPermisoDenegado(false);
    setPermisoBloqueado(false);
    try {
      const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermisoDenegado(true);
        setPermisoBloqueado(!canAskAgain);
        return;
      }

      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
      const conNombre = (data || []).filter((c) => c.name);
      // Dedup por nombre conservando el primer teléfono visto para ese nombre.
      const vistos = new Map();
      for (const c of conNombre) {
        if (!vistos.has(c.name)) vistos.set(c.name, primerTelefono(c));
      }
      const nombres = [...vistos.keys()].slice(0, MAX_CONTACTOS);

      if (nombres.length === 0) {
        setResultados([]);
        setSeleccionados([]);
        return;
      }

      telefonosRef.current = {};
      nombres.forEach((nombre, i) => { telefonosRef.current[i] = vistos.get(nombre); });

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
    try {
      // Fase 3: el tendero ya no crea proveedores_maestro directo — se propone
      // a la cola de curaduría (comparten identidad global entre todas las
      // tiendas, así que necesitan aprobación). Excepción: si el celular del
      // contacto coincide exacto con uno ya en el catálogo Y el nombre es
      // parecido, se auto-vincula sin pasar por curaduría (migración 0032).
      let vinculadosCount = 0;
      for (const i of seleccionados) {
        if (guardadosRef.current.has(i)) continue; // ya se guardó en un intento anterior
        const contacto = resultados[i];
        const categoria = contacto.categoria === 'Otro' ? '' : contacto.categoria;
        const telefono = telefonosRef.current[i] || null;

        const match = telefono
          ? await ProveedoresSugeridosExt.intentarAutoVincular({
              p_comercio_id: comercioId,
              p_nombre: contacto.nombre,
              p_telefono: telefono,
              p_categoria: categoria,
              p_canal: 'whatsapp',
            })
          : [];

        if (match && match.length > 0) {
          vinculadosCount++;
        } else {
          await ProveedoresSugeridos.crear({
            comercio_id: comercioId,
            sugerido_por: usuarioActual()?.id || null,
            nombre: contacto.nombre,
            categoria,
            canal: 'whatsapp',
            telefono,
            estado: 'pendiente',
          });
        }
        guardadosRef.current.add(i);
      }

      const pendientesCount = seleccionados.length - vinculadosCount;
      const partes = [];
      if (vinculadosCount > 0) partes.push(`${vinculadosCount} ya estaban en Compi y quedaron vinculados de una vez.`);
      if (pendientesCount > 0) partes.push(`${pendientesCount} son nuevos y quedaron en revisión — te avisamos cuando estén disponibles.`);

      Alert.alert(
        'Proveedores agregados',
        partes.join(' '),
        [{ text: 'Entendido', onPress: () => navigation.replace('Home', { comercioId, comercioNombre }) }]
      );
    } catch (e) {
      const faltan = seleccionados.length - guardadosRef.current.size;
      Alert.alert(
        'Error importando',
        faltan < seleccionados.length
          ? `${e.message}\n\nLo que ya se guardó no se duplica. Toca de nuevo para continuar con los ${faltan} que faltan.`
          : e.message
      );
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
          {permisoBloqueado
            ? 'Ya rechazaste este permiso antes, así que tu celular no nos deja volver a preguntarte aquí. Actívalo desde Ajustes y vuelve.'
            : 'Los usamos solo para ayudarte a marcar cuáles son proveedores. Puedes darnos permiso o seguir sin esto — lo agregas cuando quieras.'}
        </Text>
        <TouchableOpacity style={styles.boton} onPress={permisoBloqueado ? () => Linking.openSettings() : analizar}>
          <Text style={styles.botonTexto}>{permisoBloqueado ? 'Abrir Ajustes' : 'Dar permiso'}</Text>
        </TouchableOpacity>
        {permisoBloqueado && (
          <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={analizar}>
            <Text style={styles.botonSecundarioTexto}>Ya lo activé, reintentar</Text>
          </TouchableOpacity>
        )}
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