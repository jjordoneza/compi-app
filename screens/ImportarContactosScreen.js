import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import * as Contacts from 'expo-contacts';
import { ProveedoresSugeridos, ProveedoresSugeridosExt, RelacionesExt } from '../supabase';
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
  const [resultados, setResultados] = useState([]); // [{nombre, esProveedor, categoria, coincidencia}]
  const [seleccionados, setSeleccionados] = useState([]);
  // index -> 'si' | 'no', solo para contactos con coincidencia por nombre
  // (docs/catalogo-matching-unidades.md §4) — evita crear en curaduría un
  // proveedor que ya existe en el catálogo maestro con variación de nombre.
  const [confirmaciones, setConfirmaciones] = useState({});
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
      setConfirmaciones({});
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

  function confirmarCoincidencia(index, valor) {
    setConfirmaciones((prev) => ({ ...prev, [index]: valor }));
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
      // tiendas, así que necesitan aprobación). 2 excepciones que se resuelven
      // sin pasar por curaduría: (1) el tendero confirmó "sí, es el mismo"
      // sobre una coincidencia por nombre (docs/catalogo-matching-unidades.md
      // §4) — se vincula directo al proveedor_maestro existente; (2) el
      // celular del contacto coincide exacto con uno ya en el catálogo Y el
      // nombre es parecido, se auto-vincula (migración 0032).
      let vinculadosCount = 0;
      let relacionesTodas = null; // se carga solo si hace falta (caso 1)
      for (const i of seleccionados) {
        if (guardadosRef.current.has(i)) continue; // ya se guardó en un intento anterior
        const contacto = resultados[i];
        const categoria = contacto.categoria === 'Otro' ? '' : contacto.categoria;
        const telefono = telefonosRef.current[i] || null;

        if (contacto.coincidencia && confirmaciones[i] === 'si') {
          if (relacionesTodas === null) relacionesTodas = await RelacionesExt.listarPorComercio(comercioId);
          const inactiva = relacionesTodas.find((r) => r.proveedor_id === contacto.coincidencia.id && !r.activo);
          if (inactiva) {
            await RelacionesExt.actualizar(inactiva.id, { activo: true });
          } else if (!relacionesTodas.some((r) => r.proveedor_id === contacto.coincidencia.id && r.activo)) {
            await RelacionesExt.crear({ comercio_id: comercioId, proveedor_id: contacto.coincidencia.id });
          }
          vinculadosCount++;
          guardadosRef.current.add(i);
          continue;
        }

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

  const faltaConfirmar = seleccionados.some((i) => resultados[i]?.coincidencia && !confirmaciones[i]);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Agreguemos tus proveedores</Text>
      <Text style={styles.subtitulo}>Nuestra IA revisó tus contactos y marcó los que parecen proveedores. Ajusta si algo no está bien.</Text>

      {resultados.map((contacto, i) => {
        const activo = seleccionados.includes(i);
        return (
          <View key={i} style={[styles.item, activo && styles.itemActivo]}>
            <TouchableOpacity style={styles.itemFila} onPress={() => toggle(i)}>
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

            {activo && contacto.coincidencia && (
              <View style={styles.coincidenciaBox}>
                <Text style={styles.coincidenciaTexto}>Ya lo tenemos: {contacto.coincidencia.nombre} — ¿es este?</Text>
                <View style={styles.coincidenciaBotones}>
                  <TouchableOpacity
                    style={[styles.coincidenciaBoton, confirmaciones[i] === 'si' && styles.coincidenciaBotonActivoSi]}
                    onPress={() => confirmarCoincidencia(i, 'si')}
                  >
                    <Text style={[styles.coincidenciaBotonTexto, confirmaciones[i] === 'si' && styles.coincidenciaBotonTextoActivo]}>Sí, es el mismo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.coincidenciaBoton, confirmaciones[i] === 'no' && styles.coincidenciaBotonActivoNo]}
                    onPress={() => confirmarCoincidencia(i, 'no')}
                  >
                    <Text style={[styles.coincidenciaBotonTexto, confirmaciones[i] === 'no' && styles.coincidenciaBotonTextoActivo]}>No, es distinto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.boton, (guardando || faltaConfirmar) && { opacity: 0.5 }]}
        disabled={guardando || faltaConfirmar}
        onPress={confirmarImportar}
      >
        <Text style={styles.botonTexto}>
          {guardando
            ? 'Guardando...'
            : faltaConfirmar
              ? 'Confirma las coincidencias de arriba'
              : `Agregar ${seleccionados.length} proveedor(es)`}
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
  item: { padding: 12, borderWidth: 0.5, borderColor: COLORS.border, borderRadius: RADIUS.md, marginBottom: 8, backgroundColor: COLORS.white },
  itemActivo: { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: COLORS.successBg },
  itemFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.successBg, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkTexto: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  coincidenciaBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight },
  coincidenciaTexto: { fontSize: 12, color: COLORS.text, lineHeight: 16 },
  coincidenciaBotones: { flexDirection: 'row', gap: 8, marginTop: 8 },
  coincidenciaBoton: { flex: 1, height: 40, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  coincidenciaBotonActivoSi: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  coincidenciaBotonActivoNo: { backgroundColor: COLORS.textSecondary, borderColor: COLORS.textSecondary },
  coincidenciaBotonTexto: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  coincidenciaBotonTextoActivo: { color: COLORS.white },
  boton: { marginTop: 16, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  botonSecundario: { marginTop: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  botonSecundarioTexto: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
});