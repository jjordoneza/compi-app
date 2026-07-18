-- Vuelve a la versión de 0033 (sin n_tiendas_activas). DROP explícito por el
-- mismo motivo que en el forward: cambia el conjunto de columnas OUT.
drop function if exists admin_stats_por_proveedor();

create or replace function admin_stats_por_proveedor()
returns table (
  proveedor_id uuid,
  n_productos integer,
  n_pedidos integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    pv.id as proveedor_id,
    coalesce(prod.n_productos, 0) as n_productos,
    coalesce(ped.n_pedidos, 0) as n_pedidos
  from proveedores_maestro pv
  left join (
    select r.proveedor_id, count(distinct pr.producto_id) as n_productos
    from productos_relacion pr
    join relaciones r on r.id = pr.relacion_id
    group by r.proveedor_id
  ) prod on prod.proveedor_id = pv.id
  left join (
    select r.proveedor_id, count(p.id) as n_pedidos
    from pedidos p
    join relaciones r on r.id = p.relacion_id
    group by r.proveedor_id
  ) ped on ped.proveedor_id = pv.id;
end;
$$;
