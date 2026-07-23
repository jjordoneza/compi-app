// Registro de push token (Expo Push) — nunca bloquea: si el permiso se niega
// o falla la obtención del token, la app sigue funcionando normal, solo sin
// notificaciones push (mismo criterio que capturarUbicacion() en
// RegistroNegocioScreen). El historial en la pantalla Notificaciones no
// depende de esto — vive en la tabla `notificaciones`, se ve aunque el push
// nunca haya llegado.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { PushTokens } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registrarPushToken(comercioId) {
  if (!comercioId) return;
  try {
    const { status: actual } = await Notifications.getPermissionsAsync();
    let status = actual;
    if (status !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await PushTokens.registrar(comercioId, token, Platform.OS);
  } catch (e) {
    // Silencioso a propósito — ver comentario arriba.
  }
}
