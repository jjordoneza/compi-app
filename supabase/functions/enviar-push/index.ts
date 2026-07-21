// Edge Function: enviar-push
// Disparada por un Database Webhook (Supabase → Database → Webhooks,
// configurado a mano en el dashboard — no hay forma de crearlo por
// migración SQL) sobre INSERT en la tabla `notificaciones`. Recibe el payload
// estándar de un Database Webhook ({ type, table, record, ... }), busca los
// push tokens del comercio de esa notificación, y llama la API de Expo Push.
//
// Usa la service role key (inyectada automáticamente por el runtime de Edge
// Functions, igual que SUPABASE_URL/SUPABASE_ANON_KEY) para leer push_tokens
// sin depender de RLS — este endpoint no tiene un usuario autenticado detrás,
// lo llama el propio Postgres.
//
// La API de Expo Push (https://exp.host/--/api/v2/push/send) no requiere
// key/secreto para el envío básico — se identifica por los push tokens en sí,
// que ya están ligados a este proyecto de Expo.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificacionRecord {
  id: string;
  comercio_id: string;
  titulo: string;
  cuerpo: string;
  datos: Record<string, unknown> | null;
}

async function obtenerTokens(comercioId: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?comercio_id=eq.${comercioId}&select=token`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return [];
  const filas = await res.json();
  return (filas as Array<{ token: string }>).map((f) => f.token);
}

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const record = payload?.record as NotificacionRecord | undefined;
    if (!record?.comercio_id) {
      return new Response(JSON.stringify({ ok: false, motivo: 'sin comercio_id' }), { status: 200 });
    }

    const tokens = await obtenerTokens(record.comercio_id);
    if (tokens.length === 0) {
      // Normal: el tendero puede no haber abierto la app todavía y no tener
      // ningún token registrado. La notificación ya quedó en el historial
      // (tabla notificaciones) de todas formas.
      return new Response(JSON.stringify({ ok: true, enviados: 0 }), { status: 200 });
    }

    const mensajes = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: record.titulo,
      body: record.cuerpo,
      data: record.datos ?? {},
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
      },
      body: JSON.stringify(mensajes),
    });
    const resultado = await res.json();

    return new Response(JSON.stringify({ ok: true, enviados: tokens.length, resultado }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Nunca debe reintentar en loop ni tumbar el INSERT que la disparó — el
    // INSERT ya pasó, esto es un efecto secundario best-effort.
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
