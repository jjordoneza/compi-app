-- Ronda 2 de indicadores del dashboard admin (docs/indicadores-dashboard.md):
-- adopción/retención, efecto de red, y el resto de confianza/fricción
-- (edad de curaduría separada por cola + señales negativas por proveedor).
-- Sin vista materializada — mismo criterio que 0017: al volumen actual todo
-- esto es trivial para Postgres en vivo.
--
-- Todas las comparaciones de fecha usan ::date en vez de aritmética de
-- timestamp/timestamptz — evita depender de si comercios.created_at es
-- timestamp o timestamptz (no lo sabemos con certeza, a diferencia de
-- proveedores_sugeridos/productos_sugeridos que sí son timestamptz
-- confirmado) y da precisión de día, más que suficiente para estos
-- indicadores.

-- ───────────────────────────────────────────────────────────────────────────
-- admin_stats_estrategicos — corrige 0017: la edad de pendiente más antigua
-- se separaba en un solo número combinado; ahora va proveedores/productos
-- por separado (correción explícita del usuario). Se quita
-- curaduria_resolucion_prom_horas — queda reemplazada por
-- admin_curaduria_resolucion_tendencia() más abajo, mostrarla también aquí
-- sería un dato duplicado. Se agrega comercios_activos_semana_actual para
-- el dashboard principal. Cambia la firma de retorno → se dropea primero.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists admin_stats_estrategicos();

create or replace function admin_stats_estrategicos()
returns table (
  idc_gestionados_total integer,
  idc_proveedores_totales_total integer,
  comercios_activos_semana_actual integer,
  curaduria_edad_pendiente_proveedores_dias numeric,
  curaduria_edad_pendiente_productos_dias numeric,
  cobertura_relaciones_con_evidencia integer,
  cobertura_relaciones_sin_evidencia integer,
  cobertura_senales_negativas_total integer,
  embudo_creados_30d integer,
  embudo_entregados_30d integer,
  reab_pendiente_30d integer,
  reab_aceptada_30d integer,
  reab_pospuesta_30d integer,
  reab_ignorada_30d integer
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
    (
      select coalesce(sum(gestionados), 0)::integer
      from (
        select (select count(*) from relaciones r where r.comercio_id = c.id and r.activo) as gestionados
        from comercios c
        where c.proveedores_totales > 0
      ) x
    ),
    (
      select coalesce(sum(c.proveedores_totales), 0)::integer
      from comercios c
      where c.proveedores_totales > 0
    ),
    (
      select count(distinct a.comercio_id)::integer
      from abastecimientos a
      where date_trunc('week', a.fecha)::date = date_trunc('week', now())::date
    ),
    (
      select extract(epoch from (now() - min(created_at))) / 86400.0
      from proveedores_sugeridos where estado = 'pendiente'
    ),
    (
      select extract(epoch from (now() - min(created_at))) / 86400.0
      from productos_sugeridos where estado = 'pendiente'
    ),
    (
      select count(*) filter (where v.proveedor_id is not null)::integer
      from relaciones r
      left join v_cobertura_proveedor v on v.proveedor_id = r.proveedor_id
      where r.activo
    ),
    (
      select count(*) filter (where v.proveedor_id is null)::integer
      from relaciones r
      left join v_cobertura_proveedor v on v.proveedor_id = r.proveedor_id
      where r.activo
    ),
    (select count(*)::integer from cobertura_senales_negativas),
    (
      select count(*)::integer from abastecimientos
      where (fecha at time zone 'UTC') >= now() - interval '30 days'
    ),
    (
      select count(*)::integer from abastecimientos
      where (fecha at time zone 'UTC') >= now() - interval '30 days' and estado = 'entregado'
    ),
    (
      select count(*) filter (where respuesta = 'pendiente')::integer
      from reabastecimiento_sugerencias where generada_en >= now() - interval '30 days'
    ),
    (
      select count(*) filter (where respuesta = 'aceptada')::integer
      from reabastecimiento_sugerencias where generada_en >= now() - interval '30 days'
    ),
    (
      select count(*) filter (where respuesta = 'pospuesta')::integer
      from reabastecimiento_sugerencias where generada_en >= now() - interval '30 days'
    ),
    (
      select count(*) filter (where respuesta = 'ignorada')::integer
      from reabastecimiento_sugerencias where generada_en >= now() - interval '30 days'
    );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Adopción y retención
-- ───────────────────────────────────────────────────────────────────────────
create or replace function admin_comercios_activos_tendencia(p_granularidad text default 'week')
returns table (periodo date, activos integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_granularidad not in ('week', 'month') then
    raise exception 'p_granularidad debe ser ''week'' o ''month''';
  end if;

  return query
  select
    date_trunc(p_granularidad, a.fecha)::date as periodo,
    count(distinct a.comercio_id)::integer as activos
  from abastecimientos a
  where (a.fecha at time zone 'UTC') >= now() - case when p_granularidad = 'week'
    then interval '12 weeks' else interval '12 months' end
  group by date_trunc(p_granularidad, a.fecha)
  order by periodo;
end;
$$;

create or replace function admin_tiempo_a_primer_pedido()
returns table (comercios_con_pedido integer, promedio_dias numeric, mediana_dias numeric)
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
    count(*)::integer,
    avg(dias),
    percentile_cont(0.5) within group (order by dias)
  from (
    select (min(a.fecha)::date - c.created_at::date) as dias
    from comercios c
    join abastecimientos a on a.comercio_id = c.id
    group by c.id, c.created_at
  ) x;
end;
$$;

create or replace function admin_cohortes_retencion()
returns table (
  cohorte date,
  tamano integer,
  retencion_30d numeric,
  retencion_60d numeric,
  retencion_90d numeric
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
    date_trunc('month', c.created_at)::date as cohorte,
    count(*)::integer as tamano,
    case when now()::date >= date_trunc('month', c.created_at)::date + 30
      then round(100.0 * count(*) filter (
        where exists (
          select 1 from abastecimientos a
          where a.comercio_id = c.id and a.fecha::date >= c.created_at::date + 30
        )
      ) / count(*), 1)
      else null end as retencion_30d,
    case when now()::date >= date_trunc('month', c.created_at)::date + 60
      then round(100.0 * count(*) filter (
        where exists (
          select 1 from abastecimientos a
          where a.comercio_id = c.id and a.fecha::date >= c.created_at::date + 60
        )
      ) / count(*), 1)
      else null end as retencion_60d,
    case when now()::date >= date_trunc('month', c.created_at)::date + 90
      then round(100.0 * count(*) filter (
        where exists (
          select 1 from abastecimientos a
          where a.comercio_id = c.id and a.fecha::date >= c.created_at::date + 90
        )
      ) / count(*), 1)
      else null end as retencion_90d
  from comercios c
  group by date_trunc('month', c.created_at)
  order by cohorte;
end;
$$;

create or replace function admin_onboarding_abandono()
returns table (total integer, abandonados integer, pct numeric)
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
    count(*)::integer,
    count(*) filter (
      where not exists (select 1 from proveedores_sugeridos ps where ps.comercio_id = c.id)
        and not exists (select 1 from abastecimientos a where a.comercio_id = c.id)
    )::integer,
    round(100.0 * count(*) filter (
      where not exists (select 1 from proveedores_sugeridos ps where ps.comercio_id = c.id)
        and not exists (select 1 from abastecimientos a where a.comercio_id = c.id)
    ) / nullif(count(*), 0), 1)
  from comercios c;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Efecto de red
-- ───────────────────────────────────────────────────────────────────────────
create or replace function admin_efecto_red()
returns table (reutilizados integer, creados_solos integer, multi_comercio integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  with rel_rank as (
    select
      proveedor_id,
      row_number() over (partition by proveedor_id order by created_at) as rn
    from relaciones
    where activo
  ),
  por_proveedor as (
    select proveedor_id, count(*) as num_comercios
    from relaciones
    where activo
    group by proveedor_id
  )
  select
    (select count(*)::integer from rel_rank where rn > 1),
    (select count(*)::integer from rel_rank where rn = 1),
    (select count(*)::integer from por_proveedor where num_comercios > 1);
end;
$$;

create or replace function admin_densidad_por_barrio()
returns table (barrio text, comercios_activos integer)
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
    coalesce(c.barrio, 'Sin barrio') as barrio,
    count(distinct c.id)::integer as comercios_activos
  from comercios c
  where exists (select 1 from abastecimientos a where a.comercio_id = c.id)
  group by coalesce(c.barrio, 'Sin barrio')
  order by comercios_activos desc;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Confianza y fricción — el resto (edad ya va en admin_stats_estrategicos)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function admin_curaduria_resolucion_tendencia(p_semanas integer default 12)
returns table (semana date, resolucion_prom_horas numeric)
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
    date_trunc('week', r.resuelto_at)::date as semana,
    avg(r.horas) as resolucion_prom_horas
  from (
    select resuelto_at, extract(epoch from (resuelto_at - created_at)) / 3600.0 as horas
    from proveedores_sugeridos
    where resuelto_at is not null
    union all
    select resuelto_at, extract(epoch from (resuelto_at - created_at)) / 3600.0 as horas
    from productos_sugeridos
    where resuelto_at is not null
  ) r
  where r.resuelto_at >= now() - (p_semanas || ' weeks')::interval
  group by date_trunc('week', r.resuelto_at)
  order by semana;
end;
$$;

create or replace function admin_senales_negativas_por_proveedor()
returns table (proveedor_id uuid, nombre text, total integer, ultima_fecha timestamptz)
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
    csn.proveedor_id,
    pm.nombre,
    count(*)::integer as total,
    max(csn.created_at) as ultima_fecha
  from cobertura_senales_negativas csn
  join proveedores_maestro pm on pm.id = csn.proveedor_id
  group by csn.proveedor_id, pm.nombre
  order by total desc;
end;
$$;

comment on function admin_comercios_activos_tendencia is 'Comercios distintos con ≥1 abastecimiento por semana/mes, últimas 12 unidades. Solo admin.';
comment on function admin_tiempo_a_primer_pedido is 'Días entre registro y primer abastecimiento, promedio y mediana, solo comercios con ≥1 pedido. Solo admin.';
comment on function admin_cohortes_retencion is 'Retención por cohorte de mes de registro a 30/60/90 días. Celda null si la cohorte aún no cumple esa antigüedad. Solo admin.';
comment on function admin_onboarding_abandono is 'Comercios sin proveedores_sugeridos (nunca completaron importar contactos) y sin ningún abastecimiento. Solo admin.';
comment on function admin_efecto_red is 'Reutilizados/creados-desde-cero por relación (orden de creación por proveedor) y proveedores con más de 1 comercio activo. Solo admin.';
comment on function admin_densidad_por_barrio is 'Comercios con ≥1 abastecimiento, agrupados por barrio (texto libre, sin normalizar). Solo admin.';
comment on function admin_curaduria_resolucion_tendencia is 'Tiempo promedio de resolución de sugerencias (proveedores+productos combinados) por semana. Solo admin.';
comment on function admin_senales_negativas_por_proveedor is 'cobertura_senales_negativas agregada por proveedor. Solo admin.';
