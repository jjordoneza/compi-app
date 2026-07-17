import { supabase } from './supabaseClient';

export async function obtenerStats(dias) {
  const { data, error } = await supabase.rpc('admin_stats', { p_dias: dias });
  if (error) throw error;
  return data?.[0] || null;
}

export async function obtenerAbastecimientosPorDia() {
  const { data, error } = await supabase.rpc('admin_abastecimientos_por_dia');
  if (error) throw error;
  return data || [];
}

export async function obtenerStatsEstrategicos() {
  const { data, error } = await supabase.rpc('admin_stats_estrategicos');
  if (error) throw error;
  return data?.[0] || null;
}

export async function obtenerIdcPorComercio() {
  const { data, error } = await supabase.rpc('admin_idc_por_comercio');
  if (error) throw error;
  return data || [];
}

// ── Adopción y retención ────────────────────────────────────────────────
export async function obtenerComerciosActivosTendencia(granularidad) {
  const { data, error } = await supabase.rpc('admin_comercios_activos_tendencia', { p_granularidad: granularidad });
  if (error) throw error;
  return data || [];
}

export async function obtenerTiempoAPrimerPedido() {
  const { data, error } = await supabase.rpc('admin_tiempo_a_primer_pedido');
  if (error) throw error;
  return data?.[0] || null;
}

export async function obtenerCohortesRetencion() {
  const { data, error } = await supabase.rpc('admin_cohortes_retencion');
  if (error) throw error;
  return data || [];
}

export async function obtenerOnboardingAbandono() {
  const { data, error } = await supabase.rpc('admin_onboarding_abandono');
  if (error) throw error;
  return data?.[0] || null;
}

// ── Salud de la red ──────────────────────────────────────────────────────
export async function obtenerEfectoRed() {
  const { data, error } = await supabase.rpc('admin_efecto_red');
  if (error) throw error;
  return data?.[0] || null;
}

export async function obtenerDensidadPorBarrio() {
  const { data, error } = await supabase.rpc('admin_densidad_por_barrio');
  if (error) throw error;
  return data || [];
}

export async function obtenerSenalesNegativasPorProveedor() {
  const { data, error } = await supabase.rpc('admin_senales_negativas_por_proveedor');
  if (error) throw error;
  return data || [];
}

// ── Curaduría ─────────────────────────────────────────────────────────────
export async function obtenerCuraduriaResolucionTendencia() {
  const { data, error } = await supabase.rpc('admin_curaduria_resolucion_tendencia');
  if (error) throw error;
  return data || [];
}

export async function listarComercios() {
  const { data, error } = await supabase.from('comercios').select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function actualizarComercio(id, cambios) {
  const { error } = await supabase.from('comercios').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function listarProveedoresMaestro() {
  const { data, error } = await supabase.from('proveedores_maestro').select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearProveedorMaestro(payload) {
  const { error } = await supabase.from('proveedores_maestro').insert(payload);
  if (error) throw error;
}

export async function actualizarProveedorMaestro(id, payload) {
  const { error } = await supabase.from('proveedores_maestro').update(payload).eq('id', id);
  if (error) throw error;
}

export async function listarProductosMaestro() {
  const { data, error } = await supabase.from('productos_maestro').select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearProductoMaestro(payload) {
  const { error } = await supabase.from('productos_maestro').insert(payload);
  if (error) throw error;
}

export async function actualizarProductoMaestro(id, payload) {
  const { error } = await supabase.from('productos_maestro').update(payload).eq('id', id);
  if (error) throw error;
}

export async function listarAbastecimientosTodos() {
  const { data, error } = await supabase
    .from('abastecimientos')
    .select('*, comercios(nombre)')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listarRelacionesTodas() {
  const { data, error } = await supabase.from('relaciones').select('*');
  if (error) throw error;
  return data;
}

export async function listarProductosRelacionTodos() {
  const { data, error } = await supabase.from('productos_relacion').select('*');
  if (error) throw error;
  return data;
}

export async function listarPedidosPorAbastecimiento(abastecimientoId) {
  const { data, error } = await supabase.from('pedidos').select('*').eq('abastecimiento_id', abastecimientoId);
  if (error) throw error;
  return data;
}

export async function listarPedidoItems(pedidoId) {
  const { data, error } = await supabase.from('pedido_items').select('*').eq('pedido_id', pedidoId);
  if (error) throw error;
  return data;
}

export async function actualizarEstadoPedido(pedidoId, estado) {
  const { error } = await supabase.from('pedidos').update({ estado }).eq('id', pedidoId);
  if (error) throw error;
}

export async function actualizarEstadoAbastecimiento(abastecimientoId, estado) {
  const { error } = await supabase.from('abastecimientos').update({ estado }).eq('id', abastecimientoId);
  if (error) throw error;
}

export async function listarProveedoresPendientes() {
  const { data, error } = await supabase
    .from('proveedores_sugeridos')
    .select('*, comercios(nombre, barrio)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listarProductosPendientes() {
  const { data, error } = await supabase
    .from('productos_sugeridos')
    .select('*, comercios(nombre, barrio), relaciones(proveedor_id, proveedores_maestro(nombre))')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Migrado de ilike a similitud (pg_trgm, migración 0025) — el mismo upgrade
// que este archivo ya anticipaba (ver comentario en AprobacionPanel.jsx):
// encuentra coincidencias con errores de tipeo/variaciones de nombre, no solo
// substring exacto.
export async function buscarProveedores(query) {
  if (!query.trim()) return [];
  const { data, error } = await supabase.rpc('buscar_proveedor_similar', { p_nombre: query, p_umbral: 0.2 });
  if (error) throw error;
  return data;
}

export async function buscarProductos(query) {
  if (!query.trim()) return [];
  const { data, error } = await supabase.rpc('buscar_producto_similar', { p_nombre: query, p_umbral: 0.2 });
  if (error) throw error;
  return data;
}

export async function aprobarProveedor(sugeridoId, proveedorMaestroId) {
  const { error } = await supabase.rpc('aprobar_proveedor_sugerido', {
    p_sugerido_id: sugeridoId,
    p_proveedor_maestro_id: proveedorMaestroId || null,
  });
  if (error) throw error;
}

export async function rechazarProveedor(sugeridoId, motivo) {
  const { error } = await supabase.rpc('rechazar_proveedor_sugerido', {
    p_sugerido_id: sugeridoId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
}

export async function aprobarProducto(sugeridoId, productoMaestroId) {
  const { error } = await supabase.rpc('aprobar_producto_sugerido', {
    p_sugerido_id: sugeridoId,
    p_producto_maestro_id: productoMaestroId || null,
  });
  if (error) throw error;
}

export async function rechazarProducto(sugeridoId, motivo) {
  const { error } = await supabase.rpc('rechazar_producto_sugerido', {
    p_sugerido_id: sugeridoId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
}

export async function listarCambiosProveedorPendientes() {
  const { data, error } = await supabase
    .from('sugerencias_cambio_proveedor')
    .select('*, comercios(nombre, barrio), proveedores_maestro(nombre, telefono)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listarCambiosComercioPendientes() {
  const { data, error } = await supabase
    .from('sugerencias_cambio_comercio')
    .select('*, comercios(nombre, barrio, telefono)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function aprobarCambioProveedor(sugerenciaId) {
  const { error } = await supabase.rpc('aprobar_cambio_numero_proveedor', {
    p_sugerencia_id: sugerenciaId,
  });
  if (error) throw error;
}

export async function rechazarCambioProveedor(sugerenciaId, motivo) {
  const { error } = await supabase.rpc('rechazar_cambio_numero_proveedor', {
    p_sugerencia_id: sugerenciaId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
}

export async function aprobarCambioComercio(sugerenciaId) {
  const { error } = await supabase.rpc('aprobar_cambio_comercio', {
    p_sugerencia_id: sugerenciaId,
  });
  if (error) throw error;
}

export async function rechazarCambioComercio(sugerenciaId, motivo) {
  const { error } = await supabase.rpc('rechazar_cambio_comercio', {
    p_sugerencia_id: sugerenciaId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
}
