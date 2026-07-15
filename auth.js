// Fase 2 — Auth real del tendero: Phone Auth (OTP SMS vía Twilio, configurado en
// el dashboard de Supabase). Todo por REST (sin supabase-js por Hermes). La sesión
// se persiste en expo-secure-store y el access_token se inyecta en supabase.js.
import * as SecureStore from 'expo-secure-store';
import { SUPABASE_URL, SUPABASE_ANON_KEY, setAuthToken } from './supabase';

const CLAVE_SESION = 'compi_sesion';
let sesion = null; // { access_token, refresh_token, expires_at (epoch s), user }

const HEADERS_ANON = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };

// Normaliza un celular colombiano a E.164 (+57 + 10 dígitos). null si no aplica.
export function aE164(telefono) {
  const d = (telefono || '').replace(/\D/g, '');
  const n10 = d.slice(-10);
  return n10.length === 10 ? `+57${n10}` : null;
}

function desdeRespuesta(data) {
  const expira = data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expira,
    user: data.user || null,
  };
}

async function persistir(s) {
  sesion = s;
  setAuthToken(s?.access_token || null);
  if (s) await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(CLAVE_SESION);
}

export function haySesion() {
  return !!sesion?.access_token;
}

export function usuarioActual() {
  return sesion?.user || null;
}

// Restaura la sesión guardada al abrir la app. Refresca si está por expirar.
export async function cargarSesion() {
  try {
    const raw = await SecureStore.getItemAsync(CLAVE_SESION);
    sesion = raw ? JSON.parse(raw) : null;
  } catch {
    sesion = null;
  }
  if (sesion) {
    setAuthToken(sesion.access_token);
    await refrescarSiHaceFalta();
  }
  return sesion;
}

// Envía el código OTP por SMS.
export async function enviarOTP(telefonoE164) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: HEADERS_ANON,
    body: JSON.stringify({ phone: telefonoE164 }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.msg || e.error_description || e.error || 'No pudimos enviar el código');
  }
}

// Verifica el OTP y guarda la sesión.
export async function verificarOTP(telefonoE164, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: HEADERS_ANON,
    body: JSON.stringify({ type: 'sms', phone: telefonoE164, token }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || data.error_description || data.error || 'Código incorrecto');
  }
  await persistir(desdeRespuesta(data));
  return sesion;
}

async function refrescar() {
  if (!sesion?.refresh_token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: HEADERS_ANON,
    body: JSON.stringify({ refresh_token: sesion.refresh_token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    await persistir(null); // refresh inválido → sesión caída
    return null;
  }
  await persistir(desdeRespuesta(data));
  return sesion;
}

// Refresca si faltan menos de 60s para expirar (o ya expiró).
export async function refrescarSiHaceFalta() {
  if (!sesion) return null;
  const ahora = Math.floor(Date.now() / 1000);
  if (sesion.expires_at && sesion.expires_at - ahora < 60) {
    return refrescar();
  }
  return sesion;
}

export async function cerrarSesion() {
  await persistir(null);
}
