-- Rollback de 0007: desactiva RLS en las tablas existentes, quita las políticas,
-- restaura sugerencia_reabastecimiento a su versión no-security-definer (0001),
-- y re-otorga el acceso directo a v_cadencia_producto.
-- Uso de emergencia: si algo se rompe en producción tras activar RLS, corre
-- esto para volver al estado de antes (acceso total con anon key) mientras se
-- diagnostica, y vuelve a aplicar 0007 cuando esté corregido.

-- comercios
drop policy if exists comercios_select on comercios;
drop policy if exists comercios_insert_admin on comercios;
drop policy if exists comercios_update on comercios;
drop policy if exists comercios_delete_admin on comercios;
alter table comercios disable row level security;

-- proveedores_maestro
drop policy if exists provmaestro_select on proveedores_maestro;
drop policy if exists provmaestro_insert_admin on proveedores_maestro;
drop policy if exists provmaestro_update_admin on proveedores_maestro;
alter table proveedores_maestro disable row level security;

-- productos_maestro
drop policy if exists prodmaestro_select on productos_maestro;
drop policy if exists prodmaestro_insert_admin on productos_maestro;
drop policy if exists prodmaestro_update_admin on productos_maestro;
alter table productos_maestro disable row level security;

-- relaciones
drop policy if exists relaciones_select on relaciones;
drop policy if exists relaciones_insert on relaciones;
drop policy if exists relaciones_update on relaciones;
alter table relaciones disable row level security;

-- productos_relacion
drop policy if exists prodrel_select on productos_relacion;
drop policy if exists prodrel_insert on productos_relacion;
drop policy if exists prodrel_update on productos_relacion;
drop policy if exists prodrel_delete on productos_relacion;
alter table productos_relacion disable row level security;

-- abastecimientos
drop policy if exists abast_select on abastecimientos;
drop policy if exists abast_insert on abastecimientos;
drop policy if exists abast_update on abastecimientos;
alter table abastecimientos disable row level security;

-- pedidos
drop policy if exists pedidos_select on pedidos;
drop policy if exists pedidos_insert on pedidos;
drop policy if exists pedidos_update on pedidos;
alter table pedidos disable row level security;

-- pedido_items
drop policy if exists pedidoitems_select on pedido_items;
drop policy if exists pedidoitems_insert on pedido_items;
alter table pedido_items disable row level security;

-- sugerencias_cambio_proveedor
drop policy if exists sugcambio_select on sugerencias_cambio_proveedor;
drop policy if exists sugcambio_insert on sugerencias_cambio_proveedor;
drop policy if exists sugcambio_update_admin on sugerencias_cambio_proveedor;
alter table sugerencias_cambio_proveedor disable row level security;

-- reabastecimiento_ajustes
drop policy if exists reabajustes_select on reabastecimiento_ajustes;
drop policy if exists reabajustes_insert on reabastecimiento_ajustes;
alter table reabastecimiento_ajustes disable row level security;

-- reabastecimiento_sugerencias
drop policy if exists reabsug_select on reabastecimiento_sugerencias;
drop policy if exists reabsug_insert on reabastecimiento_sugerencias;
drop policy if exists reabsug_update on reabastecimiento_sugerencias;
alter table reabastecimiento_sugerencias disable row level security;

-- Restaura sugerencia_reabastecimiento a la versión de 0001 (sin chequeo de
-- membresía, sin security definer). OJO: esto reabre el hueco de autorización
-- que 0007 cerró — es intencional, solo para volver al estado previo exacto.
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
  multiplicador_usado numeric,
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
      and (current_date - c.ultima_compra) >= (c.promedio_intervalo * p_multiplicador)
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
    round(e.promedio_intervalo, 2) as promedio_intervalo,
    round(e.umbral_dias, 2) as umbral_dias,
    p_multiplicador as multiplicador_usado,
    round(e.ratio, 3) as ratio
  from elegido e
  join productos_maestro pm on pm.id = e.producto_id;
$$;

grant select on v_cadencia_producto to anon, authenticated;

drop function if exists proveedores_recomendados_barrio(uuid);
