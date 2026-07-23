import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Notificaciones } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

// Pantalla 24 del diseño: historial de notificaciones (confirmaciones,
// entregas). El envío del push en sí es aparte (Database Webhook + Edge
// Function enviar-push) — esta pantalla solo lee el historial en la tabla
// notificaciones, así que se ve completo aunque el push nunca haya llegado
// al teléfono (sin permiso, sin token, celular apagado, etc.).
export default function NotificacionesScreen({ route }) {
  const { comercioId } = route.params;
  const [notificaciones, setNotificaciones] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!comercioId) return;
    setError(null);
    try {
      setNotificaciones(await Notificaciones.listarPorComercio(comercioId));
    } catch (e) {
      setError(e.message);
    }
  }, [comercioId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  async function marcarLeida(item) {
    if (item.leida) return;
    setNotificaciones((prev) => prev.map((n) => (n.id === item.id ? { ...n, leida: true } : n)));
    try {
      await Notificaciones.marcarLeida(item.id);
    } catch (e) {
      // No revertimos el estado local por esto — es solo un marcador visual,
      // no vale la pena confundir al tendero con un error técnico aquí.
    }
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.vacio}>No pudimos cargar tus notificaciones</Text>
        <TouchableOpacity style={styles.botonReintentar} onPress={cargar}>
          <Text style={styles.botonReintentarTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
      {notificaciones === null && <Text style={styles.vacio}>Cargando...</Text>}
      {notificaciones !== null && notificaciones.length === 0 && (
        <Text style={styles.vacio}>Todavía no tienes notificaciones.</Text>
      )}
      {(notificaciones || []).map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.card, !item.leida && styles.cardNoLeida]}
          onPress={() => marcarLeida(item)}
        >
          <View style={styles.filaTop}>
            <Text style={styles.titulo}>{item.titulo}</Text>
            {!item.leida && <View style={styles.punto} />}
          </View>
          <Text style={styles.cuerpo}>{item.cuerpo}</Text>
          <Text style={styles.fecha}>{new Date(item.created_at).toLocaleString('es-CO')}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centrado: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vacio: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  botonReintentar: { marginTop: 14, height: 44, paddingHorizontal: 20, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonReintentarTexto: { color: COLORS.white, fontWeight: '600' },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.borderLight },
  cardNoLeida: { borderColor: COLORS.primary, borderWidth: 1 },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  cuerpo: { fontSize: 13, color: COLORS.text, marginTop: 4, lineHeight: 18 },
  fecha: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6 },
});
