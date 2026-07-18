export const SUPABASE_URL = 'https://gaxugvogfxbwhhburrai.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheHVndm9nZnhid2hoYnVycmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODg1ODYsImV4cCI6MjA5OTQ2NDU4Nn0.wCD60L-Aa12kgDbkLukUsjFwEAExtMmtcLM3_uGf73U';

// HEADERS es mutable a propósito: auth.js actualiza el Authorization con el
// access_token del tendero logueado (o vuelve a la anon key al cerrar sesión).
// Así todas las consultas de abajo usan el token vigente sin cambiar su código.
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export function setAuthToken(token) {
  HEADERS.Authorization = `Bearer ${token || SUPABASE_ANON_KEY}`;
}

async function manejar(res) {
  const texto = await res.text();
  if (!res.ok) throw new Error(`(${res.status}) ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

function tabla(nombre) {
  const url = `${SUPABASE_URL}/rest/v1/${nombre}`;
  return {
    listar: (query = '') => fetch(`${url}?select=*&order=created_at.desc${query}`, { headers: HEADERS }).then(manejar),
    crear: (payload) => fetch(url, { method: 'POST', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(payload) }).then(manejar),
    actualizar: (id, payload) => fetch(`${url}?id=eq.${id}`, { method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(payload) }).then(manejar),
    eliminar: (id) => fetch(`${url}?id=eq.${id}`, { method: 'DELETE', headers: HEADERS }).then(manejar),
  };
}

export const Comercios = tabla('comercios');
export const ProveedoresMaestro = tabla('proveedores_maestro');
export const Relaciones = tabla('relaciones');
export const ProductosMaestro = tabla('productos_maestro');
// Colas de curaduría (gap #2 Fase 3): el tendero propone, el admin aprueba.
// Ver docs/gap2-plan-roles-rls.md y supabase/migrations/0003 y 0007.
export const ProveedoresSugeridos = tabla('proveedores_sugeridos');
export const ProductosSugeridos = tabla('productos_sugeridos');

export const ProveedoresSugeridosExt = {
  ...ProveedoresSugeridos,
  listarPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/proveedores_sugeridos?comercio_id=eq.${comercioId}&select=*&order=created_at.desc`, { headers: HEADERS }).then(manejar),
};
export const ProductosRelacion = tabla('productos_relacion');
export const Abastecimientos = tabla('abastecimientos');
export const Pedidos = tabla('pedidos');
export const PedidoItems = tabla('pedido_items');
export const SugerenciasCambio = tabla('sugerencias_cambio_proveedor');
// Cambios de contacto de negocio (teléfono, nombre de quien atiende) — igual
// que arriba, pasan por curaduría admin. Ver supabase/migrations/0013.
export const SugerenciasCambioComercio = tabla('sugerencias_cambio_comercio');
export const ReabastecimientoAjustes = tabla('reabastecimiento_ajustes');

export const ComerciosExt = {
  ...Comercios,
  listarPorId: (id) => fetch(`${SUPABASE_URL}/rest/v1/comercios?id=eq.${id}&select=*`, { headers: HEADERS }).then(manejar),
};

export const ComerciosPorTelefono = {
  listar: (telefono) =>
    fetch(`${SUPABASE_URL}/rest/v1/comercios?telefono=eq.${encodeURIComponent(telefono)}&select=*`, { headers: HEADERS }).then(manejar),
};

// Comercios donde el usuario autenticado es miembro. RLS de comercio_miembros
// (cm_select) ya filtra por auth.uid(), así que no hace falta pasar el user_id.
export const MisComercios = {
  listar: () =>
    fetch(`${SUPABASE_URL}/rest/v1/comercio_miembros?select=comercios(*)`, { headers: HEADERS })
      .then(manejar)
      .then((rows) => (rows || []).map((r) => r.comercios).filter(Boolean)),
};

// RPCs de Fase 1 (crean/ligan comercios al usuario autenticado).
export const Cuenta = {
  crearComercio: (nombre, barrio, telefono, proveedoresTotales, direccion, detalles, ciudad, contactoNombre) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/crear_comercio`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        p_nombre: nombre,
        p_barrio: barrio,
        p_telefono: telefono,
        p_proveedores_totales: proveedoresTotales,
        p_direccion: direccion || null,
        p_detalles: detalles || null,
        p_ciudad: ciudad || null,
        p_contacto_nombre: contactoNombre || null,
      }),
    }).then(manejar),
  reclamarComercios: () =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/reclamar_comercios_por_telefono`, {
      method: 'POST',
      headers: HEADERS,
      body: '{}',
    }).then(manejar),
};

// RPC de Fase 3: proveedores usados por otros comercios del mismo barrio, sin
// exponer filas de esos comercios/relaciones al cliente (RLS los oculta).
export const ProveedoresRecomendados = {
  porBarrio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/proveedores_recomendados_barrio`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_comercio_id: comercioId }),
    })
      .then(manejar)
      .then((rows) => (rows || []).map((r) => r.proveedor_id)),
};

// Motor de confianza de cobertura de proveedores — inferido de relaciones
// activas + entregas reales, ver supabase/migrations/0009 y 0010.
export const CoberturaProveedor = {
  confianza: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/cobertura_confianza`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_comercio_id: comercioId }),
    }).then(manejar),
};

export const RelacionesExt = {
  ...Relaciones,
  // Sin filtrar por "activo" a propósito: el historial (Inicio, Pedidos) necesita
  // resolver nombre/precio de pedidos viejos aunque el proveedor ya esté desactivado.
  listarPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/relaciones?comercio_id=eq.${comercioId}&select=*`, { headers: HEADERS }).then(manejar),
  // Para pantallas de gestión/armar pedido: solo proveedores vinculados hoy.
  listarActivasPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/relaciones?comercio_id=eq.${comercioId}&activo=eq.true&select=*`, { headers: HEADERS }).then(manejar),
  obtenerPorId: (id) =>
    fetch(`${SUPABASE_URL}/rest/v1/relaciones?id=eq.${id}&select=*`, { headers: HEADERS })
      .then(manejar)
      .then((rows) => (rows && rows[0]) || null),
};

export const ProductosRelacionExt = {
  ...ProductosRelacion,
  listarPorRelacion: (relacionId) =>
    fetch(`${SUPABASE_URL}/rest/v1/productos_relacion?relacion_id=eq.${relacionId}&select=*`, { headers: HEADERS }).then(manejar),
};

export const AbastecimientosExt = {
  ...Abastecimientos,
  listarPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/abastecimientos?comercio_id=eq.${comercioId}&select=*&order=fecha.desc`, { headers: HEADERS }).then(manejar),
  // Fecha real de un grupo de pedidos: vive en abastecimientos, no en pedidos.
  listarPorIds: (ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : fetch(`${SUPABASE_URL}/rest/v1/abastecimientos?id=in.(${ids.join(',')})&select=*`, { headers: HEADERS }).then(manejar),
};

export const AbastecimientosGlobal = {
  listarTodos: () =>
    fetch(`${SUPABASE_URL}/rest/v1/abastecimientos?select=*&order=fecha.desc`, { headers: HEADERS }).then(manejar),
};

export const PedidosExt = {
  ...Pedidos,
  listarPorAbastecimiento: (abastecimientoId) =>
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?abastecimiento_id=eq.${abastecimientoId}&select=*`, { headers: HEADERS }).then(manejar),
  // "Eliminar proveedor": si ya tiene algún pedido, se desactiva en vez de borrar.
  existeAlgunoPorRelacion: (relacionId) =>
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?relacion_id=eq.${relacionId}&select=id&limit=1`, { headers: HEADERS })
      .then(manejar)
      .then((rows) => (rows || []).length > 0),
  // Historial de pedidos con un proveedor específico (Detalle de relación).
  listarPorRelacion: (relacionId) =>
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?relacion_id=eq.${relacionId}&select=*&order=created_at.desc`, { headers: HEADERS }).then(manejar),
};

export const PedidoItemsExt = {
  ...PedidoItems,
  listarPorPedido: (pedidoId) =>
    fetch(`${SUPABASE_URL}/rest/v1/pedido_items?pedido_id=eq.${pedidoId}&select=*`, { headers: HEADERS }).then(manejar),
};

export const PedidoItemsFull = {
  listarPorAbastecimientoCompleto: async (abastecimientoId) => {
    const pedidos = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?abastecimiento_id=eq.${abastecimientoId}&select=*`, { headers: HEADERS }).then(manejar);
    const itemsPorPedido = await Promise.all(
      pedidos.map((pedido) =>
        fetch(`${SUPABASE_URL}/rest/v1/pedido_items?pedido_id=eq.${pedido.id}&select=*`, { headers: HEADERS }).then(manejar)
      )
    );
    return pedidos.map((pedido, i) => ({ relacionId: pedido.relacion_id, items: itemsPorPedido[i] }));
  },
};

export const SugerenciasCambioExt = {
  ...SugerenciasCambio,
  listarPendientes: () =>
    fetch(`${SUPABASE_URL}/rest/v1/sugerencias_cambio_proveedor?estado=eq.pendiente&select=*`, { headers: HEADERS }).then(manejar),
  listarPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/sugerencias_cambio_proveedor?comercio_id=eq.${comercioId}&select=*&order=created_at.desc`, { headers: HEADERS }).then(manejar),
};

export const SugerenciasCambioComercioExt = {
  ...SugerenciasCambioComercio,
  listarPendientePorComercio: (comercioId) =>
    fetch(
      `${SUPABASE_URL}/rest/v1/sugerencias_cambio_comercio?comercio_id=eq.${comercioId}&estado=eq.pendiente&select=*&order=created_at.desc&limit=1`,
      { headers: HEADERS }
    ).then(manejar),
};

export const ReabastecimientoAjustesExt = {
  ...ReabastecimientoAjustes,
  listarPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/reabastecimiento_ajustes?comercio_id=eq.${comercioId}&select=*`, { headers: HEADERS }).then(manejar),
};

export const ReabastecimientoSugerencias = tabla('reabastecimiento_sugerencias');

export const ReabastecimientoSugerenciasExt = {
  ...ReabastecimientoSugerencias,
  listarPendientesPorComercio: (comercioId) =>
    fetch(`${SUPABASE_URL}/rest/v1/reabastecimiento_sugerencias?comercio_id=eq.${comercioId}&respuesta=eq.pendiente&select=*`, { headers: HEADERS }).then(manejar),
};

export const ProductosMaestroExt = {
  ...ProductosMaestro,
  buscarPorNombreExacto: async (nombre) => {
    const todos = await ProductosMaestro.listar();
    return todos.find((p) => p.nombre.toLowerCase().trim() === nombre.toLowerCase().trim()) || null;
  },
};

// Mediana de precio_pactado de OTROS comercios para un proveedor+producto en
// toda la red (migración 0026). null si hay menos de 3 comercios con
// evidencia — el cliente lo trata como "sin referencia todavía".
export const PrecioReferencia = {
  obtener: (comercioId, proveedorId, productoId) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/precio_referencia`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        p_comercio_id: comercioId,
        p_proveedor_id: proveedorId,
        p_producto_id: productoId,
      }),
    })
      .then(manejar)
      .then((rows) => (rows && rows[0]) || null),
};

// Motor de Reabastecimiento Predictivo — el cálculo vive en el núcleo (Postgres).
// Ver supabase/migrations y docs/reabastecimiento-predictivo.md.
export const Reabastecimiento = {
  // Devuelve la sugerencia (0 o 1) para un comercio, o null.
  sugerencia: (comercioId, multiplicador) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/sugerencia_reabastecimiento`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        p_comercio_id: comercioId,
        ...(multiplicador != null ? { p_multiplicador: multiplicador } : {}),
      }),
    })
      .then(manejar)
      .then((rows) => (rows && rows[0]) || null),
};