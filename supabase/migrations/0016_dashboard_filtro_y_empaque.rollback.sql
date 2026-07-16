drop function if exists admin_stats(integer);

create or replace function admin_stats()
returns table (
  total_comercios integer,
  total_proveedores_maestro integer,
  total_productos_maestro integer,
  pedidos_pendientes integer,
  pedidos_confirmados integer,
  pedidos_entregados integer,
  sugerencias_pendientes integer,
  usuarios_activos_7d integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*)::integer from comercios),
    (select count(*)::integer from proveedores_maestro),
    (select count(*)::integer from productos_maestro),
    (select count(*)::integer from pedidos where estado = 'pendiente'),
    (select count(*)::integer from pedidos where estado = 'confirmado'),
    (select count(*)::integer from pedidos where estado = 'entregado'),
    (
      (select count(*)::integer from proveedores_sugeridos where estado = 'pendiente') +
      (select count(*)::integer from productos_sugeridos where estado = 'pendiente') +
      (select count(*)::integer from sugerencias_cambio_proveedor where estado = 'pendiente') +
      (select count(*)::integer from sugerencias_cambio_comercio where estado = 'pendiente')
    ),
    (select count(*)::integer from auth.users where last_sign_in_at > now() - interval '7 days');
end;
$$;

alter table productos_maestro drop column if exists unidad_empaque;
alter table productos_maestro drop column if exists unidades_por_caja;
