import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { cerrarSesion } from '../../auth';
import { useComercioActual } from '../../comercioActual';
import { RelacionesExt, Notificaciones } from '../../supabase';
import { COLORS, RADIUS } from '../../theme';

export default function PerfilScreen({ navigation, route }) {
  const { comercioId } = route.params || {};
  const { comercioActual } = useComercioActual();
  const comercioNombre = comercioActual?.comercioNombre ?? route.params?.comercioNombre;
  // IDC (Índice de Dependencia de Compi), visible al tendero como incentivo
  // de adopción (gap P3 #8). Número absoluto, nunca fracción contra
  // proveedores_totales — mismo criterio ya documentado en
  // docs/indicadores-dashboard.md (proveedores_totales es una estimación de
  // memoria de una sola vez, dividir podía dar >100% y dejaba de tener sentido.
  const [proveedoresActivos, setProveedoresActivos] = useState(null);
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    if (!comercioId) return;
    RelacionesExt.listarActivasPorComercio(comercioId)
      .then((rels) => setProveedoresActivos(rels.length))
      .catch(() => {}); // no bloquea el perfil por esto
  }, [comercioId]);

  // "focus": al volver de Notificaciones (donde se marcan como leídas), el
  // contador debe bajar sin tener que reabrir la app.
  useFocusEffect(
    useCallback(() => {
      if (!comercioId) return;
      Notificaciones.listarPorComercio(comercioId)
        .then((lista) => setNoLeidas(lista.filter((n) => !n.leida).length))
        .catch(() => {});
    }, [comercioId])
  );

  async function salir() {
    await cerrarSesion();
    const root = navigation.getParent() || navigation;
    root.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Perfil</Text>
      <Text style={styles.subtitulo}>{comercioNombre}</Text>

      {proveedoresActivos != null && (
        <View style={styles.idcCard}>
          <Text style={styles.idcValor}>{proveedoresActivos}</Text>
          <Text style={styles.idcTexto}>
            proveedor{proveedoresActivos === 1 ? '' : 'es'} activo{proveedoresActivos === 1 ? '' : 's'} en Compi
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.boton}
        onPress={() => navigation.navigate('Notificaciones', { comercioId })}
      >
        <View style={styles.botonConBadge}>
          <Text style={styles.botonTexto}>Notificaciones</Text>
          {noLeidas > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{noLeidas}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.boton, { marginTop: 10 }]}
        onPress={() => navigation.navigate('MiNegocioTendero', { comercioId })}
      >
        <Text style={styles.botonTexto}>Editar mi negocio</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.boton, { marginTop: 10 }]}
        onPress={() => navigation.navigate('SeleccionarNegocio')}
      >
        <Text style={styles.botonTexto}>Cambiar de negocio</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.boton, { marginTop: 10 }]} onPress={salir}>
        <Text style={styles.botonTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 60 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  idcCard: { backgroundColor: COLORS.successBg, borderRadius: RADIUS.md, padding: 16, marginBottom: 20, alignItems: 'center' },
  idcValor: { fontSize: 32, fontWeight: '700', color: COLORS.success },
  idcTexto: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  boton: { height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  botonTexto: { color: COLORS.text, fontWeight: '500', fontSize: 14 },
  botonConBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeTexto: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
});