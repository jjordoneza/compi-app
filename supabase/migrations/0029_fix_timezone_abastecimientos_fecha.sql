-- Fix: la hora mostrada en el historial de pedidos no coincidía con la hora
-- real del pedido. Causa confirmada por el usuario (information_schema.columns):
-- abastecimientos.fecha es `timestamp without time zone` — Postgres la guarda
-- "tal cual", sin zona horaria, así que el cliente (new Date(ab.fecha).toLocaleString())
-- puede interpretarla mal según en qué zona horaria corrió la sesión que la leyó.
--
-- Supabase corre sus instancias de Postgres con timezone de sesión en UTC por
-- defecto (confirmable con `show timezone;`), y como el cliente nunca manda
-- `fecha` explícito (Abastecimientos.crear no la incluye, así que sale del
-- default de la columna), los valores ya guardados son, en la práctica, la
-- hora UTC "pelada". `AT TIME ZONE 'UTC'` reinterpreta esos valores como UTC
-- y les asigna la zona horaria correcta al convertir a timestamptz — no
-- desplaza el instante, solo lo etiqueta correctamente.
--
-- Corrección (18 jul 2026, primer intento falló): la vista v_cadencia_producto
-- (migración 0001, Motor de Reabastecimiento Predictivo) depende de esta
-- columna vía su regla _RETURN — Postgres no deja cambiar el tipo de una
-- columna usada por una vista sin tumbarla primero. Se dropea, se altera la
-- columna, y se recrea idéntica (su cast `a.fecha::date` funciona igual o
-- mejor con timestamptz, ya que ahora sí es timezone-aware). También hay que
-- re-aplicar el revoke de 0007 — recrear la vista resetea sus grants.
drop view if exists v_cadencia_producto;

alter table abastecimientos
  alter column fecha type timestamptz using fecha at time zone 'UTC';

alter table abastecimientos
  alter column fecha set default now();

comment on column abastecimientos.fecha is 'timestamptz (corregido 18 jul 2026 — antes timestamp sin zona horaria, causaba desfase de hora en el historial). Guarda el momento de creación del abastecimiento.';

-- Idéntica a la definición original (migración 0001) — solo se recrea porque
-- el DROP de arriba era obligatorio, no porque cambie su lógica.
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

-- Recreada sin grants: hay que re-revocar como en 0007 (revoke select on
-- v_cadencia_producto from anon, authenticated) — el acceso directo por REST
-- nunca debió existir, todo pasa por la RPC sugerencia_reabastecimiento
-- (security definer, valida membresía).
revoke select on v_cadencia_producto from anon, authenticated;
