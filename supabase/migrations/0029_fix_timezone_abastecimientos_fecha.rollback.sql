-- Revierte a timestamp sin zona horaria (comportamiento previo, con el bug
-- de desfase de hora). Usa AT TIME ZONE 'UTC' en sentido inverso para volver
-- al mismo valor "pelado" que había antes. Mismo motivo que en el forward:
-- hay que dropear/recrear, en orden de dependencia, las 4 vistas que dependen
-- de abastecimientos.fecha (v_cadencia_producto, v_cobertura_proveedor,
-- v_patron_dia_proveedor, v_patron_dia_dominante).
drop view if exists v_patron_dia_dominante;
drop materialized view if exists v_patron_dia_proveedor;
drop materialized view if exists v_cobertura_proveedor;
drop view if exists v_cadencia_producto;

alter table abastecimientos
  alter column fecha type timestamp without time zone using fecha at time zone 'UTC';

alter table abastecimientos
  alter column fecha set default now();

comment on column abastecimientos.fecha is null;

create or replace view v_cadencia_producto as
with compras as (
  select distinct
    a.comercio_id,
    pr.producto_id,
    a.fecha::date as dia
  from abastecimientos a
  join pedidos p            on p.abastecimiento_id = a.id
  join pedido_items pi      on pi.pedido_id = p.id
  join productos_relacion pr on pr.id = pi.producto_relacion_id
),
ordenadas as (
  select
    comercio_id,
    producto_id,
    dia,
    lag(dia) over (partition by comercio_id, producto_id order by dia) as dia_anterior
  from compras
)
select
  comercio_id,
  producto_id,
  count(*)                                             as num_compras,
  max(dia)                                             as ultima_compra,
  avg((dia - dia_anterior))
    filter (where dia_anterior is not null)            as promedio_intervalo
from ordenadas
group by comercio_id, producto_id;

comment on view v_cadencia_producto is
  'Cadencia de compra por comercio y producto (SKU global). num_compras cuenta días distintos; promedio_intervalo en días.';

revoke select on v_cadencia_producto from anon, authenticated;

create materialized view v_cobertura_proveedor as
with evidencia as (
  select
    r.proveedor_id,
    r.id as relacion_id,
    c.lat,
    c.lng,
    coalesce(
      (select max(a.fecha)
       from pedidos p
       join abastecimientos a on a.id = p.abastecimiento_id
       where p.relacion_id = r.id and p.estado = 'entregado'),
      r.created_at
    ) as ultima_actividad
  from relaciones r
  join comercios c on c.id = r.comercio_id
  where r.activo and c.lat is not null and c.lng is not null
),
centros as (
  select
    proveedor_id,
    count(*) as num_comercios,
    percentile_cont(0.5) within group (order by lat) as centro_lat,
    percentile_cont(0.5) within group (order by lng) as centro_lng,
    max(ultima_actividad) as ultima_actividad
  from evidencia
  group by proveedor_id
  having count(*) >= 3
)
select
  c.proveedor_id,
  c.num_comercios::integer as num_comercios,
  c.centro_lat,
  c.centro_lng,
  c.ultima_actividad,
  percentile_cont(0.75) within group (order by
    earth_distance(ll_to_earth(c.centro_lat, c.centro_lng), ll_to_earth(e.lat, e.lng)) / 1000.0
  ) as radio_km
from centros c
join evidencia e on e.proveedor_id = c.proveedor_id
group by c.proveedor_id, c.num_comercios, c.centro_lat, c.centro_lng, c.ultima_actividad;

create unique index on v_cobertura_proveedor (proveedor_id);

comment on materialized view v_cobertura_proveedor is
  'Centro (mediana) y radio (p75) de cobertura por proveedor, inferidos de relaciones activas con comercios que tienen GPS. Mínimo 3 comercios con evidencia. Confianza NO vive aquí, se calcula en cobertura_confianza().';

create materialized view v_patron_dia_proveedor as
select
  r.proveedor_id,
  c.barrio,
  extract(dow from a.fecha)::int as dia_semana,
  count(*) as num_entregas,
  max(a.fecha) as ultima_entrega
from pedidos p
join abastecimientos a on a.id = p.abastecimiento_id
join relaciones r on r.id = p.relacion_id
join comercios c on c.id = r.comercio_id
where p.estado = 'entregado' and c.barrio is not null
group by r.proveedor_id, c.barrio, extract(dow from a.fecha)
having count(*) >= 3;

create unique index on v_patron_dia_proveedor (proveedor_id, barrio, dia_semana);

comment on materialized view v_patron_dia_proveedor is
  'Conteo de entregas por (proveedor, barrio, día de la semana). Usa comercios.barrio (texto libre) — hereda la misma fragilidad de normalización que proveedores_recomendados_barrio; no se resuelve en esta migración.';

create or replace view v_patron_dia_dominante as
select distinct on (proveedor_id, barrio)
  proveedor_id, barrio, dia_semana, num_entregas
from v_patron_dia_proveedor
order by proveedor_id, barrio, num_entregas desc, ultima_entrega desc;
