import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

const AI_PROXY_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`;

async function llamarProxy(payload) {
  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Error llamando a la IA');
  }
  return data;
}

export async function detectarProveedores(nombresContactos) {
  return llamarProxy({ accion: 'detectar-proveedores', nombresContactos });
}

export async function extraerProductosDePedido(textoPedido) {
  return llamarProxy({ accion: 'extraer-productos', textoPedido });
}
