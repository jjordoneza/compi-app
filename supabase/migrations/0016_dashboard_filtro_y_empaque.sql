-- 1) admin_stats gana un parámetro de rango (día/semana/mes) para los
-- indicadores de pedidos y usuarios activos — el resto (totales de
-- catálogo, sugerencias pendientes) sigue siendo una foto del momento, no
-- tiene sentido filtrarlos por fecha. Cambia la firma (0 → 1 argumento) —
-- se dropea la vieja primero para no dejar un overload huérfano (mismo
-- cuidado que crear_comercio en 0006/0012).
drop function if exists admin_stats();

create or replace function admin_stats(p_dias integer default 7)
returns table (
  total_comercios integer,
  total_proveedores_maestro integer,
  total_productos_maestro integer,
  pedidos_pendientes integer,
  pedidos_confirmados integer,
  pedidos_entregados integer,
  sugerencias_pendientes integer,
  usuarios_activos integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_desde timestamptz := now() - (greatest(p_dias, 1) || ' days')::interval;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*)::integer from comercios),
    (select count(*)::integer from proveedores_maestro),
    (select count(*)::integer from productos_maestro),
    (select count(*)::integer from pedidos p
       join abastecimientos a on a.id = p.abastecimiento_id
       where p.estado = 'pendiente' and (a.fecha at time zone 'UTC') >= v_desde),
    (select count(*)::integer from pedidos p
       join abastecimientos a on a.id = p.abastecimiento_id
       where p.estado = 'confirmado' and (a.fecha at time zone 'UTC') >= v_desde),
    (select count(*)::integer from pedidos p
       join abastecimientos a on a.id = p.abastecimiento_id
       where p.estado = 'entregado' and (a.fecha at time zone 'UTC') >= v_desde),
    (
      (select count(*)::integer from proveedores_sugeridos where estado = 'pendiente') +
      (select count(*)::integer from productos_sugeridos where estado = 'pendiente') +
      (select count(*)::integer from sugerencias_cambio_proveedor where estado = 'pendiente') +
      (select count(*)::integer from sugerencias_cambio_comercio where estado = 'pendiente')
    ),
    (select count(*)::integer from auth.users where last_sign_in_at >= v_desde);
end;
$$;

comment on function admin_stats is 'Conteos agregados para el dashboard admin. p_dias controla la ventana de pedidos/usuarios activos (1=día, 7=semana, 30=mes) — catálogo y sugerencias pendientes son siempre una foto del momento. Solo admin.';

-- 2) Empaque en productos_maestro: cuántas unidades individuales trae una
-- caja (ej. "Coca-Cola 1.5L": unidad_empaque='botella', unidades_por_caja=12).
-- Deliberadamente al nivel del maestro y NO en productos_relacion — más
-- simple que el diseño de docs/catalogo-matching-unidades.md (que mueve la
-- presentación a la relación porque cada proveedor empaca distinto); esa
-- pieza sigue pendiente/retomable, esto es un campo informativo aparte, más
-- liviano, para lo que se pidió ahora.
alter table productos_maestro add column if not exists unidad_empaque text;
alter table productos_maestro add column if not exists unidades_por_caja integer;

comment on column productos_maestro.unidad_empaque is 'Nombre de la unidad individual dentro de la caja/empaque, ej. "botella", "bolsa", "unidad". Nullable.';
comment on column productos_maestro.unidades_por_caja is 'Cuántas unidades individuales trae una caja/empaque, ej. 12. Nullable.';
