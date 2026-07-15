import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Abastecimientos, Pedidos, PedidoItems } from '../../supabase';
import { COLORS, RADIUS, formatMoney } from '../../theme';

export default function ConfirmarPedidoScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { comercioId, comercioNombre, gruposParaEnviar, totalEstimado } = route.params;
  const [enviando, setEnviando] = useState(false);

  function confirmarEnvio() {
    Alert.alert(
      'Enviar abastecimiento',
      `Vas a enviar este pedido a ${gruposParaEnviar.length} proveedor(es). ¿Confirmas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: enviar },
      ]
    );
  }

  async function enviar() {
    setEnviando(true);
    try {
      const abastecimiento = await Abastecimientos.crear({ comercio_id: comercioId, estado: 'procesando' });
      const abastecimientoId = abastecimiento[0].id;

      for (const grupo of gruposParaEnviar) {
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
      }

      // Reset en vez de replace: elimina del historial el formulario de pedido y esta pantalla,
      // así "Atrás" desde la pantalla de éxito no regresa a un pedido ya enviado.
      navigation.reset({
        index: 0,
        routes: [{ name: 'PedidoEnviado', params: { comercioId, comercioNombre, abastecimientoId } }],
      });
    } catch (e) {
      Alert.alert('Error enviando', e.message);
      setEnviando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 + insets.bottom, paddingTop: 20 }}>
        <Text style={styles.titulo}>Confirmar</Text>
        <Text style={styles.subtitulo}>Enviaremos esta solicitud a tus proveedores.</Text>

        {gruposParaEnviar.map((grupo) => {
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
              {grupo.items.map((item, i) => (
                <View key={i} style={styles.filaItem}>
                  <Text style={styles.itemNombre}>{item.nombre} · {item.presentacion}</Text>
                  <View style={styles.itemDerecha}>
                    <Text style={styles.itemCantidad}>x{item.cantidad}</Text>
                    <Text style={styles.itemPrecio}>
                      {item.precio != null ? `$${formatMoney(item.precio)}` : 'sin precio'}
                    </Text>
                  </View>
                </View>
              ))}
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
    </View>
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
  filaItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemNombre: { fontSize: 13, color: COLORS.text, flex: 1 },
  itemDerecha: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemCantidad: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemPrecio: { fontSize: 12, color: COLORS.textSecondary, minWidth: 60, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, padding: 16 },
  footerFila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  footerTexto: { fontSize: 13, color: COLORS.textSecondary },
  footerTotal: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  botonEnviar: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonEnviarTexto: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
});