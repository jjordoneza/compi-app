drop function if exists admin_comercios_activos_tendencia(text);
drop function if exists admin_tiempo_a_primer_pedido();
drop function if exists admin_cohortes_retencion();
drop function if exists admin_onboarding_abandono();
drop function if exists admin_efecto_red();
drop function if exists admin_densidad_por_barrio();
drop function if exists admin_curaduria_resolucion_tendencia(integer);
drop function if exists admin_senales_negativas_por_proveedor();

-- Vuelve admin_stats_estrategicos a la forma de 0017 (edad combinada,
-- resolución de últimas 20 incluida, sin comercios_activos_semana_actual).
drop function if exists admin_stats_estrategicos();

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
