import { supabase } from './supabaseClient';

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

export async function buscarProveedores(query) {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('proveedores_maestro')
    .select('id, nombre, categoria')
    .ilike('nombre', `%${query}%`)
    .limit(8);
  if (error) throw error;
  return data;
}

export async function buscarProductos(query) {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('productos_maestro')
    .select('id, nombre, presentacion, categoria')
    .ilike('nombre', `%${query}%`)
    .limit(8);
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
    .select('*, comercios(nombre, barrio, telefono, contacto_nombre)')
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
