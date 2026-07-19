import { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Abastecimientos, Pedidos, PedidoItems, ProductosRelacionExt } from '../../supabase';
import { COLORS, RADIUS, formatMoney } from '../../theme';

function limpiarNumero(texto) {
  const soloDigitos = texto.replace(/[^0-9]/g, '');
  return soloDigitos ? parseInt(soloDigitos, 10) : null;
}

export default function ConfirmarPedidoScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { comercioId, comercioNombre, gruposParaEnviar } = route.params;
  const [enviando, setEnviando] = useState(false);
  // Copia local editable: permite completar precios sin salir de esta
  // pantalla (empujón "faltan N precios") en vez de mandar al tendero a otra
  // pantalla y perder este borrador de pedido.
  const [grupos, setGrupos] = useState(gruposParaEnviar);
  const [precioEditandoId, setPrecioEditandoId] = useState(null);
  const [precioEditandoValor, setPrecioEditandoValor] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);
  // Sin transacción real de por medio: si un intento falla a mitad de camino,
  // guardamos qué abastecimiento y qué proveedores ya quedaron creados para que
  // reintentar "Enviar" continúe donde quedó, en vez de duplicar lo ya enviado.
  const abastecimientoIdRef = useRef(null);
  const enviadosRef = useRef(new Set());

  const itemsFaltantes = [];
  grupos.forEach((grupo) => {
    grupo.items.forEach((item) => {
      if (item.precio == null) itemsFaltantes.push(item);
    });
  });

  function empezarEditarPrecio(item) {
    setPrecioEditandoId(item.productoRelacionId);
    setPrecioEditandoValor('');
  }

  async function guardarPrecioInline(item) {
    if (guardandoPrecio) return;
    const nuevoPrecio = limpiarNumero(precioEditandoValor);
    if (nuevoPrecio == null) return;
    setGuardandoPrecio(true);
    try {
      await ProductosRelacionExt.actualizar(item.productoRelacionId, { precio_pactado: nuevoPrecio });
      setGrupos((prev) =>
        prev.map((grupo) => ({
          ...grupo,
          items: grupo.items.map((it) =>
            it.productoRelacionId === item.productoRelacionId ? { ...it, precio: nuevoPrecio } : it
          ),
        }))
      );
      setPrecioEditandoId(null);
    } catch (e) {
      Alert.alert('Error guardando precio', e.message);
    } finally {
      setGuardandoPrecio(false);
    }
  }

  const todosLosItems = grupos.flatMap((g) => g.items);
  const faltaAlgunPrecio = todosLosItems.some((it) => it.precio == null);
  const totalEstimado = faltaAlgunPrecio
    ? null
    : todosLosItems.reduce((sum, it) => sum + it.precio * it.cantidad, 0);

  function confirmarEnvio() {
    Alert.alert(
      'Enviar abastecimiento',
      `Vas a enviar este pedido a ${grupos.length} proveedor(es). ¿Confirmas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: enviar },
      ]
    );
  }

  async function enviar() {
    setEnviando(true);
    try {
      if (!abastecimientoIdRef.current) {
        const abastecimiento = await Abastecimientos.crear({ comercio_id: comercioId, estado: 'procesando' });
        abastecimientoIdRef.current = abastecimiento[0].id;
      }
      const abastecimientoId = abastecimientoIdRef.current;

      for (const grupo of grupos) {
        if (enviadosRef.current.has(grupo.relacionId)) continue; // ya se guardó en un intento anterior

        const pedido = await Pedidos.crear({
          abastecimiento_id: abastecimientoId,
          relacion_id: grupo.relacionId,
          estado: 'pendiente',
        });
        const pedidoId = pedido[0].id;

        for (const item of grupo.items) {
          await PedidoItems.crear({
            pedido_id: pedidoId,
            producto_relacion_id: item.productoRelacionId,
            cantidad: item.cantidad,
          });
        }

        enviadosRef.current.add(grupo.relacionId);
      }

      // Reset en vez de replace: elimina del historial el formulario de pedido y esta pantalla,
      // así "Atrás" desde la pantalla de éxito no regresa a un pedido ya enviado.
      navigation.reset({
        index: 0,
        routes: [{ name: 'PedidoEnviado', params: { comercioId, comercioNombre, abastecimientoId } }],
      });
    } catch (e) {
      const faltan = grupos.length - enviadosRef.current.size;
      Alert.alert(
        'Error enviando',
        faltan < grupos.length
          ? `${e.message}\n\nTranquilo: lo que ya se envió no se duplica. Toca "Enviar" de nuevo para continuar con los ${faltan} proveedor(es) que faltan.`
          : e.message
      );
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 + insets.bottom, paddingTop: 20 }}>
        <Text style={styles.titulo}>Confirmar</Text>
        <Text style={styles.subtitulo}>Enviaremos esta solicitud a tus proveedores.</Text>

        {itemsFaltantes.length > 0 && (
          <TouchableOpacity style={styles.avisoPrecios} onPress={() => empezarEditarPrecio(itemsFaltantes[0])}>
            <Text style={styles.avisoPreciosTexto}>
              Faltan {itemsFaltantes.length} precio{itemsFaltantes.length === 1 ? '' : 's'} · ponlos ahora
            </Text>
          </TouchableOpacity>
        )}

        {grupos.map((grupo) => {
          const itemsConPrecio = grupo.items.filter((it) => it.precio != null);
          const faltaPrecio = itemsConPrecio.length < grupo.items.length;
          const subtotal = itemsConPrecio.reduce((sum, it) => sum + it.precio * it.cantidad, 0);

          return (
            <View key={grupo.relacionId} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.proveedorNombre}>{grupo.proveedorNombre}</Text>
                <Text style={styles.subtotalTexto}>
                  {faltaPrecio ? 'Precio incompleto' : `$${formatMoney(subtotal)}`}
                </Text>
              </View>
              {grupo.items.map((item, i) => {
                const editandoEste = precioEditandoId === item.productoRelacionId;
                return (
                  <View key={i} style={styles.filaItem}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.filaItemTop}>
                        <Text style={styles.itemNombre}>{item.nombre} · {item.presentacion}</Text>
                        <View style={styles.itemDerecha}>
                          <Text style={styles.itemCantidad}>x{item.cantidad}</Text>
                          {item.precio != null ? (
                            <Text style={styles.itemPrecio}>${formatMoney(item.precio)}</Text>
                          ) : (
                            !editandoEste && (
                              <TouchableOpacity onPress={() => empezarEditarPrecio(item)}>
                                <Text style={styles.tocaTexto}>tócalo para ponerlo</Text>
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      </View>
                      {editandoEste && (
                        <View style={styles.filaEdicion}>
                          <TextInput
                            style={styles.inputPrecio}
                            keyboardType="numeric"
                            placeholder="Ej. 13500"
                            value={precioEditandoValor}
                            onChangeText={setPrecioEditandoValor}
                            autoFocus
                          />
                          <TouchableOpacity style={styles.botonMini} disabled={guardandoPrecio} onPress={() => guardarPrecioInline(item)}>
                            <Text style={styles.botonMiniTexto}>{guardandoPrecio ? 'Guardando...' : 'Guardar'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.botonMiniCancelar} onPress={() => setPrecioEditandoId(null)}>
                            <Text style={styles.botonMiniCancelarTexto}>Cancelar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.footerFila}>
          <Text style={styles.footerTexto}>Total estimado</Text>
          <Text style={styles.footerTotal}>
            {totalEstimado != null ? `$${formatMoney(totalEstimado)}` : 'Incompleto'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.botonEnviar, enviando && { opacity: 0.5 }]} disabled={enviando} onPress={confirmarEnvio}>
          <Text style={styles.botonEnviarTexto}>{enviando ? 'Enviando...' : 'Enviar abastecimiento'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  proveedorNombre: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  subtotalTexto: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  filaItem: { paddingVertical: 3 },
  filaItemTop: { flexDirection: 'row', justifyContent: 'space-between' },
  itemNombre: { fontSize: 13, color: COLORS.text, flex: 1 },
  itemDerecha: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemCantidad: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemPrecio: { fontSize: 12, color: COLORS.textSecondary, minWidth: 60, textAlign: 'right' },
  tocaTexto: { fontSize: 11, color: COLORS.warning, fontWeight: '600' },
  avisoPrecios: { backgroundColor: COLORS.warningBg, borderRadius: RADIUS.sm, padding: 12, marginBottom: 12 },
  avisoPreciosTexto: { color: COLORS.warning, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  filaEdicion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  inputPrecio: { flex: 1, height: 38, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: COLORS.white },
  botonMini: { backgroundColor: COLORS.primary, paddingVertical: 8, paddingHorizontal: 10, borderRadius: RADIUS.sm },
  botonMiniTexto: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  botonMiniCancelar: { paddingVertical: 8, paddingHorizontal: 6 },
  botonMiniCancelarTexto: { color: COLORS.textSecondary, fontSize: 12 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, padding: 16 },
  footerFila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  footerTexto: { fontSize: 13, color: COLORS.textSecondary },
  footerTotal: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  botonEnviar: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonEnviarTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
});