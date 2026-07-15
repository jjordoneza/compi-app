-- PR-A — Motor de Reabastecimiento Predictivo: cálculo en el núcleo (Postgres).
-- Aplicar desde el SQL Editor del dashboard de Supabase.
-- Asume PKs uuid (default de Supabase). Si alguna tabla usa bigint/int8, ajustar
-- los tipos en la firma de la RPC.

-- Vista: cadencia de compra por (comercio, producto).
-- Fecha de compra = abastecimientos.fecha. Se cuenta una compra por día distinto.
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

-- RPC: devuelve 0 o 1 sugerencia para un comercio (la de mayor "ratio").
-- p_multiplicador es parámetro (default 1.3) para poder recalibrar sin tocar la app.
create or replace function sugerencia_reabastecimiento(
  p_comercio_id uuid,
  p_multiplicador numeric default 1.3
)
returns table (
  producto_id uuid,
  producto_nombre text,
  producto_relacion_id uuid,
  dias_desde_ultima integer,
  promedio_intervalo numeric,
  umbral_dias numeric,
  ratio numeric
)
language sql
stable
as $$
  with candidatos as (
    select
      c.producto_id,
      c.promedio_intervalo,
      (current_date - c.ultima_compra)                          as dias_desde_ultima,
      (c.promedio_intervalo * p_multiplicador)                  as umbral_dias,
      (current_date - c.ultima_compra) / nullif(c.promedio_intervalo * p_multiplicador, 0) as ratio
    from v_cadencia_producto c
    where c.comercio_id = p_comercio_id
      and c.num_compras >= 3
      and c.promedio_intervalo > 0
      -- ya toca reponer
      and (current_date - c.ultima_compra) >= (c.promedio_intervalo * p_multiplicador)
      -- respeta el "no sugerir antes de" vigente
      and not exists (
        select 1 from reabastecimiento_ajustes ra
        where ra.comercio_id = p_comercio_id
          and ra.producto_id = c.producto_id
          and ra.no_sugerir_antes_de > now()
      )
  ),
  elegido as (
    select * from candidatos order by ratio desc limit 1
  )
  select
    e.producto_id,
    pm.nombre as producto_nombre,
    -- opción de precio: la primera con precio pactado del comercio, o cualquiera
    (
      select pr.id
      from productos_relacion pr
      join relaciones r on r.id = pr.relacion_id
      where pr.producto_id = e.producto_id
        and r.comercio_id = p_comercio_id
      order by (pr.precio_pactado is null), pr.precio_pactado
      limit 1
    ) as producto_relacion_id,
    e.dias_desde_ultima::integer,
    round(e.promedio_intervalo, 1) as promedio_intervalo,
    round(e.umbral_dias, 1) as umbral_dias,
    round(e.ratio, 3) as ratio
  from elegido e
  join productos_maestro pm on pm.id = e.producto_id;
$$;

comment on function sugerencia_reabastecimiento is
  'Una sugerencia de reabastecimiento (o ninguna) para un comercio. Reglas Fase 3: min 3 compras, multiplicador 1.3x, una a la vez.';
