-- Motor de confianza de cobertura de proveedores. Infiere automáticamente
-- dónde y cuándo un proveedor entrega de verdad, a partir de relaciones
-- activas + pedidos entregados reales — no pide ningún dato nuevo a nadie.
-- Independiente de Fase 4 (curaduría admin): opera solo sobre relaciones,
-- comercios, pedidos y abastecimientos, todas ya en producción. El campo
-- manual zonas_cobertura (declarado a mano por un admin) queda fuera de esta
-- migración a propósito — es señal secundaria, pendiente de Fase 4.
--
-- Todos los timestamps de origen (abastecimientos.fecha, relaciones.created_at)
-- son `timestamp without time zone`. Se asume que la app siempre escribe en
-- UTC (comportamiento por defecto de Supabase) — donde hace falta comparar
-- contra now() se usa `at time zone 'UTC'` explícito, para no depender del
-- TimeZone de la sesión que ejecute la consulta.

create extension if not exists cube;
create extension if not exists earthdistance;

-- ───────────────────────────────────────────────────────────────────────────
-- v_cobertura_proveedor — agregación geográfica cara, recalculada
-- periódicamente (vista materializada). NO calcula "confianza" — eso vive en
-- la RPC de abajo, como parámetro ajustable, para poder recalibrar el
-- decaimiento sin rehacer la vista (mismo principio que el multiplicador de
-- sugerencia_reabastecimiento).
-- ───────────────────────────────────────────────────────────────────────────
create materialized view v_cobertura_proveedor as
with evidencia as (
  select
    r.proveedor_id,
    r.id as relacion_id,
    c.lat,
    c.lng,
    -- Última actividad real: la entrega más reciente si existe; si la
    -- relación nunca tuvo un pedido entregado, su fecha de creación funciona
    -- como ancla más débil (decae igual que cualquier otra en la RPC).
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
    -- Mediana, no promedio: una tienda excepcionalmente lejana no debe
    -- arrastrar el centro hacia ella.
    percentile_cont(0.5) within group (order by lat) as centro_lat,
    percentile_cont(0.5) within group (order by lng) as centro_lng,
    max(ultima_actividad) as ultima_actividad
  from evidencia
  group by proveedor_id
  having count(*) >= 3   -- mínimo de evidencia, igual que el motor de reabastecimiento
)
select
  c.proveedor_id,
  c.num_comercios::integer as num_comercios,
  c.centro_lat,
  c.centro_lng,
  c.ultima_actividad,
  -- p75, no p90/máximo: mismo motivo que la mediana — un outlier no debe
  -- inflar el radio "normal" de cobertura.
  percentile_cont(0.75) within group (order by
    earth_distance(ll_to_earth(c.centro_lat, c.centro_lng), ll_to_earth(e.lat, e.lng)) / 1000.0
  ) as radio_km
from centros c
join evidencia e on e.proveedor_id = c.proveedor_id
group by c.proveedor_id, c.num_comercios, c.centro_lat, c.centro_lng, c.ultima_actividad;

create unique index on v_cobertura_proveedor (proveedor_id);

comment on materialized view v_cobertura_proveedor is
  'Centro (mediana) y radio (p75) de cobertura por proveedor, inferidos de relaciones activas con comercios que tienen GPS. Mínimo 3 comercios con evidencia. Confianza NO vive aquí, se calcula en cobertura_confianza().';

-- ───────────────────────────────────────────────────────────────────────────
-- v_patron_dia_proveedor — patrón de día de entrega por (proveedor, barrio).
-- Mismo tipo de agregación que v_cadencia_producto, aplicado a esta dimensión.
-- ───────────────────────────────────────────────────────────────────────────
create materialized view v_patron_dia_proveedor as
select
  r.proveedor_id,
  c.barrio,
  extract(dow from a.fecha)::int as dia_semana,  -- 0=domingo … 6=sábado
  count(*) as num_entregas,
  max(a.fecha) as ultima_entrega
from pedidos p
join abastecimientos a on a.id = p.abastecimiento_id
join relaciones r on r.id = p.relacion_id
join comercios c on c.id = r.comercio_id
where p.estado = 'entregado' and c.barrio is not null
group by r.proveedor_id, c.barrio, extract(dow from a.fecha)
having count(*) >= 3;  -- mismo mínimo de evidencia que el resto del motor

create unique index on v_patron_dia_proveedor (proveedor_id, barrio, dia_semana);

comment on materialized view v_patron_dia_proveedor is
  'Conteo de entregas por (proveedor, barrio, día de la semana). Usa comercios.barrio (texto libre) — hereda la misma fragilidad de normalización que proveedores_recomendados_barrio; no se resuelve en esta migración.';

-- Día dominante por (proveedor, barrio): el de más entregas, desempate por más reciente.
create or replace view v_patron_dia_dominante as
select distinct on (proveedor_id, barrio)
  proveedor_id, barrio, dia_semana, num_entregas
from v_patron_dia_proveedor
order by proveedor_id, barrio, num_entregas desc, ultima_entrega desc;

-- ───────────────────────────────────────────────────────────────────────────
-- Refresco periódico de ambas vistas materializadas (pg_cron, ya habilitado).
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

select cron.schedule(
  'refresh_cobertura_proveedor',
  '0 */6 * * *',
  $$refresh materialized view concurrently v_cobertura_proveedor$$
);

select cron.schedule(
  'refresh_patron_dia_proveedor',
  '0 3 * * *',
  $$refresh materialized view concurrently v_patron_dia_proveedor$$
);

-- ───────────────────────────────────────────────────────────────────────────
-- cobertura_confianza — RPC de consulta. Combina evidencia propia (con
-- decaimiento temporal por vida media) con arranque en frío heredado de
-- proveedores similares (misma categoría) que ya operan en el barrio del
-- comercio consultante. Todos los parámetros de calibración son ajustables
-- sin tocar la vista ni la app.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function cobertura_confianza(
  p_comercio_id uuid,
  p_vida_media_dias numeric default 60,     -- días para que la confianza se reduzca a la mitad
  p_saturacion_comercios numeric default 8, -- num_comercios a partir del cual la evidencia "satura"
  p_descuento_heredado numeric default 0.5, -- penalización al heredar confianza de proveedores similares
  p_factor_radio_max numeric default 2.0    -- más allá de este múltiplo del radio, confianza en el punto = 0
)
returns table (
  proveedor_id uuid,
  confianza numeric,
  distancia_km numeric,
  num_comercios integer,
  fuente text,               -- 'propio' | 'heredado' | 'sin_evidencia'
  dia_semana_dominante integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_barrio text;
begin
  if not (es_miembro(p_comercio_id) or is_admin()) then
    raise exception 'No autorizado para este comercio';
  end if;

  select lat, lng, barrio into v_lat, v_lng, v_barrio from comercios where id = p_comercio_id;

  return query
  with propios as (
    select
      v.proveedor_id,
      v.num_comercios,
      v.radio_km,
      case when v_lat is null or v_lng is null then null
        else earth_distance(ll_to_earth(v.centro_lat, v.centro_lng), ll_to_earth(v_lat, v_lng)) / 1000.0
      end as distancia_km,
      -- Decaimiento exponencial por vida media: simple de razonar ("cada N
      -- días sin actividad, la confianza se reduce a la mitad"), nunca llega
      -- a cero de golpe. `at time zone 'UTC'` evita depender del TimeZone de
      -- la sesión que ejecute la consulta.
      power(
        0.5,
        extract(epoch from (now() - (v.ultima_actividad at time zone 'UTC'))) / 86400.0 / p_vida_media_dias
      ) as decay
    from v_cobertura_proveedor v
  ),
  propios_confianza as (
    select
      proveedor_id,
      num_comercios,
      distancia_km,
      least(1.0, num_comercios / p_saturacion_comercios) * decay *
      case
        when distancia_km is null then 0.5  -- comercio consultante sin GPS: castigo moderado, no cero
        when distancia_km <= radio_km then 1.0
        when distancia_km <= radio_km * p_factor_radio_max
          then 1.0 - (distancia_km - radio_km) / greatest(radio_km, 0.1)
        else 0.0
      end as confianza,
      'propio'::text as fuente
    from propios
  ),
  heredados as (
    select
      pm.id as proveedor_id,
      0 as num_comercios,
      null::numeric as distancia_km,
      coalesce((
        select avg(pc.confianza) * p_descuento_heredado
        from propios_confianza pc
        join proveedores_maestro otro_prov on otro_prov.id = pc.proveedor_id
        join relaciones r2 on r2.proveedor_id = otro_prov.id and r2.activo
        join comercios c2 on c2.id = r2.comercio_id
        where v_barrio is not null
          and c2.barrio = v_barrio
          and string_to_array(otro_prov.categoria, ', ') && string_to_array(pm.categoria, ', ')
      ), 0) as confianza,
      case when v_barrio is null then 'sin_evidencia' else 'heredado' end as fuente
    from proveedores_maestro pm
    where pm.id not in (select proveedor_id from propios_confianza)
  ),
  combinado as (
    select proveedor_id, confianza, distancia_km, num_comercios, fuente from propios_confianza
    union all
    select proveedor_id, confianza, distancia_km, num_comercios, fuente from heredados
  )
  select
    co.proveedor_id,
    co.confianza,
    co.distancia_km,
    co.num_comercios,
    co.fuente,
    pd.dia_semana as dia_semana_dominante
  from combinado co
  left join v_patron_dia_dominante pd
    on pd.proveedor_id = co.proveedor_id and pd.barrio = v_barrio and co.fuente = 'propio';
end;
$$;

comment on function cobertura_confianza is
  'Confianza de cobertura (0-1) por proveedor para un comercio dado: evidencia propia con decaimiento temporal, o heredada (descontada) de proveedores similares en el mismo barrio si no hay evidencia directa. Nunca bloquea — el cliente decide qué hacer con el número.';

-- ───────────────────────────────────────────────────────────────────────────
-- Señal negativa: "No cubre mi zona" al eliminar un proveedor sin historial.
-- Se guarda para referencia futura — no se usa todavía (ej. bajar prioridad
-- de recomendación cerca de ese punto queda para una iteración posterior).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists cobertura_senales_negativas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores_maestro(id) on delete cascade,
  comercio_id uuid not null references comercios(id) on delete cascade,
  motivo text,  -- 'fuera_de_zona' por ahora; abierto a otros motivos después
  created_at timestamptz not null default now()
);

alter table cobertura_senales_negativas enable row level security;

create policy cobsenales_insert on cobertura_senales_negativas
  for insert with check (es_miembro(comercio_id) or is_admin());
create policy cobsenales_select_admin on cobertura_senales_negativas
  for select using (is_admin());

comment on table cobertura_senales_negativas is
  'Señales de "este proveedor no me cubre" reportadas por el tendero al eliminar un proveedor sin pedidos. Se guarda para análisis futuro, no se consume todavía.';
