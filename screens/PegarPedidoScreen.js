import { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ProductosRelacionExt, ProductosSugeridos } from '../supabase';
import { usuarioActual } from '../auth';
import { extraerProductosDePedido } from '../ai';
import { COLORS, RADIUS } from '../theme';

export default function PegarPedidoScreen({ route, navigation }) {
  const { comercioId, comercioNombre, relacionId, proveedorNombre } = route.params;
  const [texto, setTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [detectados, setDetectados] = useState(null);
  // index -> 'si' | 'no', solo para ítems con coincidencia — decide si se
  // vincula al producto existente o se manda a curaduría como distinto.
  const [confirmaciones, setConfirmaciones] = useState({});
  const [guardando, setGuardando] = useState(false);
  // Índices ya guardados con éxito, para que un reintento tras fallo parcial
  // no vuelva a crear los mismos productos.
  const procesadosRef = useRef(new Set());

  async function convertir() {
    if (!texto.trim()) return;
    setProcesando(true);
    try {
      const productos = await extraerProductosDePedido(texto.trim());
      setDetectados(productos);
      setConfirmaciones({});
      procesadosRef.current = new Set();
    } catch (e) {
      Alert.alert('No pudimos leer el pedido', e.message);
    } finally {
      setProcesando(false);
    }
  }

  function confirmarCoincidencia(index, valor) {
    setConfirmaciones((prev) => ({ ...prev, [index]: valor }));
  }

  const faltaConfirmar = (detectados || []).some((item, i) => item.coincidencia && !confirmaciones[i]);

  function actualizarCantidad(index, delta) {
    // Mínimo 1: un ítem con cantidad 0 no tiene sentido guardarlo — para
    // quitarlo del todo está el botón "Quitar".
    setDetectados((prev) =>
      prev.map((p, i) => (i === index ? { ...p, cantidad: Math.max(1, p.cantidad + delta) } : p))
    );
  }

  function quitarProducto(index) {
    // Quitar un ítem corre los índices de los demás — se limpia el registro de
    // "ya guardado" para no desalinearlo con un guardado parcial previo.
    procesadosRef.current = new Set();
    setDetectados((prev) => prev.filter((_, i) => i !== index));
  }

  async function confirmarGuardar() {
    if (!detectados || detectados.length === 0 || faltaConfirmar) return;
    setGuardando(true);
    try {
      const precargaCantidades = {};

      for (let i = 0; i < detectados.length; i++) {
        if (procesadosRef.current.has(i)) continue; // ya se guardó en un intento anterior
        const item = detectados[i];
        // "Ya lo tenemos, ¿es este?" confirmado por el tendero: vincula al
        // producto EXISTENTE, sin curaduría (docs/catalogo-matching-unidades.md).
        // Sin coincidencia, o el tendero dijo "no, es distinto": va a la cola.
        const esElMismo = item.coincidencia && confirmaciones[i] === 'si';
        if (esElMismo) {
          const productoRelacionCreado = await ProductosRelacionExt.crear({
            relacion_id: relacionId,
            producto_id: item.coincidencia.id,
            precio_pactado: null,
            presentacion: item.presentacion || null,
            factor_conversion: item.factor_conversion || 1,
            unidad_pedido: item.unidad_pedido || null,
          });
          precargaCantidades[productoRelacionCreado[0].id] = item.cantidad;
        } else {
          await ProductosSugeridos.crear({
            comercio_id: comercioId,
            relacion_id: relacionId,
            sugerido_por: usuarioActual()?.id || null,
            nombre: item.nombre,
            presentacion: item.presentacion,
            categoria: item.categoria || '',
            marca: item.marca || null,
            unidad_base: item.unidad_base || null,
            factor_conversion: item.factor_conversion || null,
            unidad_pedido: item.unidad_pedido || null,
            estado: 'pendiente',
          });
        }
        procesadosRef.current.add(i);
      }

      // Se recalcula sobre TODOS los ítems (no solo los de este intento), así
      // el mensaje queda correcto aunque esta llamada sea un reintento tras
      // un fallo parcial anterior.
      const nuevosCount = detectados.filter((item, i) => !(item.coincidencia && confirmaciones[i] === 'si')).length;
      const matchCount = detectados.length - nuevosCount;
      const partesMensaje = [];
      if (matchCount > 0) partesMensaje.push(`${matchCount} ya estaban en nuestro catálogo y quedaron vinculados a ${proveedorNombre}.`);
      if (nuevosCount > 0) partesMensaje.push(`${nuevosCount} son nuevos y quedaron en revisión — te avisamos cuando estén disponibles.`);

      Alert.alert(
        'Catálogo actualizado',
        partesMensaje.join(' ') + (matchCount > 0 ? '\n\n¿Quieres armar un pedido de una vez con los ya vinculados?' : ''),
        matchCount > 0
          ? [
              { text: 'No, solo guardar', style: 'cancel', onPress: () => navigation.goBack() },
              {
                text: 'Sí, armar pedido',
                onPress: () =>
                  navigation.replace('NuevoAbastecimiento', {
                    comercioId,
                    comercioNombre,
                    precargarCantidades: precargaCantidades,
                  }),
              },
            ]
          : [{ text: 'Entendido', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      const faltan = detectados.length - procesadosRef.current.size;
      Alert.alert(
        'Error guardando',
        faltan < detectados.length
          ? `${e.message}\n\nLo que ya se guardó no se duplica. Toca "Se ve bien, guardar" de nuevo para continuar con los ${faltan} que faltan.`
          : e.message
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {detectados === null ? (
          <>
            <Text style={styles.titulo}>¿Qué le compras a {proveedorNombre}?</Text>
            <Text style={styles.subtitulo}>Pega tu último pedido de WhatsApp. Esto arma el catálogo de lo que este proveedor te vende — no crea un pedido todavía. Recuerda ponerle la marca y el tamaño a cada producto.</Text>
            <TextInput
              style={styles.textarea}
              multiline
              placeholder='Ej. "vecino regáleme 2 canastas de huevo AA y una de huevo B para hoy porfa"'
              value={texto}
              onChangeText={setTexto}
            />
            <TouchableOpacity
              style={[styles.boton, (!texto.trim() || procesando) && { opacity: 0.5 }]}
              disabled={!texto.trim() || procesando}
              onPress={convertir}
            >
              {procesando ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.botonTexto}>✦ Convertir en lista</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.titulo}>✦ Esto entendimos</Text>
            <Text style={styles.subtitulo}>Revisa que esté bien. Puedes ajustar antes de guardar.</Text>

            {detectados.length === 0 && (
              <Text style={styles.vacio}>No detectamos ningún producto. Intenta con otro texto.</Text>
            )}

            {detectados.map((item, i) => (
              <View key={i} style={styles.itemCard}>
                <View style={styles.filaItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNombre}>{item.nombre}</Text>
                    <Text style={styles.itemSub}>{item.presentacion}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity style={styles.stepperBoton} onPress={() => actualizarCantidad(i, -1)}>
                      <Text style={styles.stepperTexto}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepperNumero}>{item.cantidad}</Text>
                    <TouchableOpacity style={[styles.stepperBoton, styles.stepperBotonMas]} onPress={() => actualizarCantidad(i, 1)}>
                      <Text style={[styles.stepperTexto, { color: COLORS.white }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => quitarProducto(i)} style={{ marginLeft: 10 }}>
                    <Text style={styles.quitarTexto}>Quitar</Text>
                  </TouchableOpacity>
                </View>

                {item.coincidencia && (
                  <View style={styles.coincidenciaBox}>
                    <Text style={styles.coincidenciaTexto}>
                      Ya lo tenemos: {item.coincidencia.nombre}
                      {item.coincidencia.presentacion ? ` · ${item.coincidencia.presentacion}` : ''} — ¿es este?
                    </Text>
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
            ))}

            {detectados.length > 0 && (
              <TouchableOpacity
                style={[styles.boton, (guardando || faltaConfirmar) && { opacity: 0.5 }]}
                disabled={guardando || faltaConfirmar}
                onPress={confirmarGuardar}
              >
                <Text style={styles.botonTexto}>
                  {guardando ? 'Guardando...' : faltaConfirmar ? 'Confirma las coincidencias de arriba' : 'Se ve bien, guardar'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.botonSecundario} onPress={() => setDetectados(null)}>
              <Text style={styles.botonSecundarioTexto}>Intentar con otro texto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonSecundario}
              onPress={() => navigation.navigate('Home', { comercioId, comercioNombre })}
            >
              <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 19, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 16, lineHeight: 18 },
  textarea: { minHeight: 100, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, textAlignVertical: 'top' },
  boton: { marginTop: 16, height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  botonSecundario: { marginTop: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: COLORS.textSecondary, fontSize: 13 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  itemCard: { backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  filaItem: { flexDirection: 'row', alignItems: 'center' },
  itemNombre: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBoton: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepperBotonMas: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepperTexto: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  stepperNumero: { fontSize: 14, fontWeight: '600', color: COLORS.text, minWidth: 18, textAlign: 'center' },
  quitarTexto: { fontSize: 11, color: COLORS.error, fontWeight: '600' },
  coincidenciaBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight },
  coincidenciaTexto: { fontSize: 12, color: COLORS.text, lineHeight: 16 },
  coincidenciaBotones: { flexDirection: 'row', gap: 8, marginTop: 8 },
  coincidenciaBoton: { flex: 1, height: 40, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  coincidenciaBotonActivoSi: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  coincidenciaBotonActivoNo: { backgroundColor: COLORS.textSecondary, borderColor: COLORS.textSecondary },
  coincidenciaBotonTexto: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  coincidenciaBotonTextoActivo: { color: COLORS.white },
});