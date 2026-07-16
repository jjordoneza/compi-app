-- Dashboard del panel admin: una sola RPC que agrega todos los conteos en el
-- servidor (evita N llamadas separadas desde el cliente) y expone
-- "usuarios activos" sin dar acceso directo a auth.users desde PostgREST
-- (ese esquema no está expuesto vía REST — solo esta función, security
-- definer, puede leerlo, y solo devuelve un conteo, nunca filas con PII).
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

-- Volumen diario de abastecimientos (últimos 30 días) para el gráfico de
-- tendencia del dashboard. Igual de protegida — solo admin.
create or replace function admin_abastecimientos_por_dia()
returns table (dia date, total integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select a.fecha::date as dia, count(*)::integer as total
  from abastecimientos a
  where a.fecha >= (now() - interval '30 days')
  group by a.fecha::date
  order by dia;
end;
$$;

comment on function admin_stats is 'Conteos agregados para el dashboard del panel admin. Solo admin.';
comment on function admin_abastecimientos_por_dia is 'Abastecimientos creados por día, últimos 30 días, para el gráfico de tendencia del dashboard. Solo admin.';
