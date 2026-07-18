-- Revierte a timestamp sin zona horaria (comportamiento previo, con el bug
-- de desfase de hora). Usa AT TIME ZONE 'UTC' en sentido inverso para volver
-- al mismo valor "pelado" que había antes. Mismo motivo que en el forward:
-- hay que dropear/recrear v_cadencia_producto alrededor del cambio de tipo.
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
