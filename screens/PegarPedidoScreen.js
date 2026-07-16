import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ProductosMaestroExt, ProductosRelacionExt, ProductosSugeridos } from '../supabase';
import { usuarioActual } from '../auth';
import { extraerProductosDePedido } from '../ai';
import { COLORS, RADIUS } from '../theme';

export default function PegarPedidoScreen({ route, navigation }) {
  const { comercioId, comercioNombre, relacionId, proveedorNombre } = route.params;
  const [texto, setTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [detectados, setDetectados] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function convertir() {
    if (!texto.trim()) return;
    setProcesando(true);
    try {
      const productos = await extraerProductosDePedido(texto.trim());
      setDetectados(productos);
    } catch (e) {
      Alert.alert('No pudimos leer el pedido', e.message);
    } finally {
      setProcesando(false);
    }
  }

  function actualizarCantidad(index, delta) {
    setDetectados((prev) =>
      prev.map((p, i) => (i === index ? { ...p, cantidad: Math.max(0, p.cantidad + delta) } : p))
    );
  }

  function quitarProducto(index) {
    setDetectados((prev) => prev.filter((_, i) => i !== index));
  }

  async function confirmarGuardar() {
    if (!detectados || detectados.length === 0) return;
    setGuardando(true);
    try {
      const precargaCantidades = {};
      let nuevosCount = 0;

      for (const item of detectados) {
        // Fase 3: solo un match exacto con el catálogo global se autoservicio
        // (vincular un producto EXISTENTE a mi relación). Si no existe, ya no lo
        // creamos directo en productos_maestro — va a la cola de curaduría.
        const productoMaestro = await ProductosMaestroExt.buscarPorNombreExacto(item.nombre);
        if (productoMaestro) {
          const productoRelacionCreado = await ProductosRelacionExt.crear({
            relacion_id: relacionId,
            producto_id: productoMaestro.id,
            precio_pactado: null,
          });
          precargaCantidades[productoRelacionCreado[0].id] = item.cantidad;
        } else {
          await ProductosSugeridos.crear({
            comercio_id: comercioId,
            relacion_id: relacionId,
            sugerido_por: usuarioActual()?.id || null,
            nombre: item.nombre,
            presentacion: item.presentacion,
            categoria: '',
            estado: 'pendiente',
          });
          nuevosCount++;
        }
      }

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
      Alert.alert('Error guardando', e.message);
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
            <Text style={styles.subtitulo}>Pega tu último pedido de WhatsApp. Esto arma el catálogo de lo que este proveedor te vende — no crea un pedido todavía.</Text>
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
              <View key={i} style={styles.item}>
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
            ))}

            {detectados.length > 0 && (
              <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.5 }]} disabled={guardando} onPress={confirmarGuardar}>
                <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Se ve bien, guardar'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.botonSecundario} onPress={() => setDetectados(null)}>
              <Text style={styles.botonSecundarioTexto}>Intentar con otro texto</Text>
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
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.borderLight },
  itemNombre: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBoton: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepperBotonMas: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepperTexto: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  stepperNumero: { fontSize: 14, fontWeight: '600', color: COLORS.text, minWidth: 18, textAlign: 'center' },
  quitarTexto: { fontSize: 11, color: COLORS.error, fontWeight: '600' },
});