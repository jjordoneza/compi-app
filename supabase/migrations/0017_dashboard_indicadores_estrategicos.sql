-- Indicadores estratégicos del dashboard admin (IDC, salud de curaduría,
-- salud de cobertura, embudo de abastecimiento, salud de reabastecimiento
-- predictivo). Sin vista materializada — al volumen actual (decenas de
-- comercios) las consultas en vivo son triviales; se revisa esa decisión
-- si el catálogo crece a miles de comercios.

-- ───────────────────────────────────────────────────────────────────────────
-- resuelto_at: proveedores_sugeridos/productos_sugeridos no registraban
-- CUÁNDO se resolvió una sugerencia (solo created_at + estado) — sin esto,
-- "tiempo promedio de resolución" es imposible de calcular. Las 4 RPCs de
-- 0011 se actualizan para setearlo al aprobar/rechazar.
-- ───────────────────────────────────────────────────────────────────────────
alter table proveedores_sugeridos add column if not exists resuelto_at timestamptz;
alter table productos_sugeridos add column if not exists resuelto_at timestamptz;

create or replace function aprobar_proveedor_sugerido(
  p_sugerido_id uuid,
  p_proveedor_maestro_id uuid default null
)
returns proveedores_maestro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug proveedores_sugeridos;
  v_prov proveedores_maestro;
  v_relacion_id uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from proveedores_sugeridos where id = p_sugerido_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerido_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  if p_proveedor_maestro_id is null then
    insert into proveedores_maestro (nombre, categoria)
      values (v_sug.nombre, coalesce(v_sug.categoria, ''))
      returning * into v_prov;
  else
    select * into v_prov from proveedores_maestro where id = p_proveedor_maestro_id;
    if not found then
      raise exception 'Proveedor maestro % no existe', p_proveedor_maestro_id;
    end if;
  end if;

  select id into v_relacion_id from relaciones
    where comercio_id = v_sug.comercio_id and proveedor_id = v_prov.id
    limit 1;

  if v_relacion_id is null then
    insert into relaciones (comercio_id, proveedor_id) values (v_sug.comercio_id, v_prov.id);
  else
    update relaciones set activo = true where id = v_relacion_id and activo = false;
  end if;

  update proveedores_sugeridos
    set estado = 'aprobado', proveedor_maestro_id = v_prov.id, resuelto_at = now()
    where id = p_sugerido_id;

  return v_prov;
end;
$$;

create or replace function rechazar_proveedor_sugerido(
  p_sugerido_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado from proveedores_sugeridos where id = p_sugerido_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerido_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update proveedores_sugeridos
    set estado = 'rechazado', motivo_rechazo = p_motivo, resuelto_at = now()
    where id = p_sugerido_id;
end;
$$;

create or replace function aprobar_producto_sugerido(
  p_sugerido_id uuid,
  p_producto_maestro_id uuid default null
)
returns productos_maestro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug productos_sugeridos;
  v_prod productos_maestro;
  v_existe uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from productos_sugeridos where id = p_sugerido_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerido_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  if p_producto_maestro_id is null then
    insert into productos_maestro (nombre, presentacion, categoria)
      values (v_sug.nombre, v_sug.presentacion, coalesce(v_sug.categoria, ''))
      returning * into v_prod;
  else
    select * into v_prod from productos_maestro where id = p_producto_maestro_id;
    if not found then
      raise exception 'Producto maestro % no existe', p_producto_maestro_id;
    end if;
  end if;

  select id into v_existe from productos_relacion
    where relacion_id = v_sug.relacion_id and producto_id = v_prod.id
    limit 1;

  if v_existe is null then
    insert into productos_relacion (relacion_id, producto_id, precio_pactado)
      values (v_sug.relacion_id, v_prod.id, v_sug.precio_pactado);
  else
    update productos_relacion
      set precio_pactado = coalesce(v_sug.precio_pactado, precio_pactado)
      where id = v_existe;
  end if;

  update productos_sugeridos
    set estado = 'aprobado', producto_maestro_id = v_prod.id, resuelto_at = now()
    where id = p_sugerido_id;

  return v_prod;
end;
$$;

create or replace function rechazar_producto_sugerido(
  p_sugerido_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado from productos_sugeridos where id = p_sugerido_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerido_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update productos_sugeridos
    set estado = 'rechazado', motivo_rechazo = p_motivo, resuelto_at = now()
    where id = p_sugerido_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- admin_stats_estrategicos — una fila con los 5 grupos de indicadores.
-- IDC agregado PONDERADO (suma de gestionados / suma de totales, no promedio
-- de porcentajes) para que una tienda con proveedores_totales=1 no distorsione
-- el global. Solo cuenta comercios con proveedores_totales > 0 declarado.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function admin_stats_estrategicos()
returns table (
  idc_gestionados_total integer,
  idc_proveedores_totales_total integer,
  curaduria_edad_pendiente_dias numeric,
  curaduria_resolucion_prom_horas numeric,
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
      select extract(epoch from (now() - min(creado))) / 86400.0
      from (
        select created_at as creado from proveedores_sugeridos where estado = 'pendiente'
        union all
        select created_at as creado from productos_sugeridos where estado = 'pendiente'
      ) pendientes
    ),
    (
      select avg(horas) from (
        select extract(epoch from (resuelto_at - created_at)) / 3600.0 as horas, resuelto_at
        from (
          select created_at, resuelto_at from proveedores_sugeridos
            where estado in ('aprobado', 'rechazado') and resuelto_at is not null
          union all
          select created_at, resuelto_at from productos_sugeridos
            where estado in ('aprobado', 'rechazado') and resuelto_at is not null
        ) combinado
        order by resuelto_at desc
        limit 20
      ) ultimas
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
-- admin_idc_por_comercio — desglose del IDC, una fila por comercio.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function admin_idc_por_comercio()
returns table (
  comercio_id uuid,
  nombre text,
  gestionados integer,
  proveedores_totales integer
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
    c.id,
    c.nombre,
    (select count(*)::integer from relaciones r where r.comercio_id = c.id and r.activo),
    c.proveedores_totales
  from comercios c
  order by c.nombre;
end;
$$;

comment on function admin_stats_estrategicos is 'Indicadores estratégicos del dashboard admin: IDC ponderado, salud de curaduría, salud de cobertura, embudo de abastecimiento (30d), salud de reabastecimiento predictivo (30d). Solo admin.';
comment on function admin_idc_por_comercio is 'Desglose del IDC por comercio (gestionados vs. proveedores_totales declarado). Solo admin.';
