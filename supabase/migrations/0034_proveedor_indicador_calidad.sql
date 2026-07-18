-- Indicador de "calidad" del proveedor (decisión de producto, 18 jul 2026):
-- sin datos reales de calidad (entregas a tiempo, quejas — eso necesita el
-- agente de WhatsApp con proveedores, que no existe aún), se aproxima con
-- volumen en la red: cuántas tiendas ACTIVAS lo usan hoy. Es la señal
-- disponible más honesta de "confiabilidad adoptada", no mide calidad real.
-- Los umbrales de la etiqueta (ver MaestroProveedores.jsx) son provisionales
-- y se pueden recalibrar sin tocar esta función.
--
-- DROP explícito antes del CREATE: 0033 ya creó esta función con 3 columnas
-- de salida (sin n_tiendas_activas) — Postgres no permite CREATE OR REPLACE
-- cuando cambia el conjunto de columnas OUT, solo cuando el cuerpo cambia
-- con la misma firma.
drop function if exists admin_stats_por_proveedor();

create or replace function admin_stats_por_proveedor()
returns table (
  proveedor_id uuid,
  n_productos integer,
  n_pedidos integer,
  n_tiendas_activas integer
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
    coalesce(ped.n_pedidos, 0) as n_pedidos,
    coalesce(tiendas.n_tiendas_activas, 0) as n_tiendas_activas
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
  ) ped on ped.proveedor_id = pv.id
  left join (
    select r.proveedor_id, count(distinct r.comercio_id) as n_tiendas_activas
    from relaciones r
    where r.activo = true
    group by r.proveedor_id
  ) tiendas on tiendas.proveedor_id = pv.id;
end;
$$;

comment on function admin_stats_por_proveedor is 'Por cada proveedor_maestro: # productos distintos, # pedidos históricos y # tiendas activas (esta última usada como proxy de "calidad"/adopción — no hay señal real de calidad todavía). Usado por MaestroProveedores.jsx.';
