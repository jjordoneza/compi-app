-- Gap #2 · Fase 3 — Activa RLS en las tablas existentes + políticas.
-- LA MIGRACIÓN PELIGROSA: rompe el acceso total por anon key. A partir de acá,
-- cada tabla exige auth.uid() + es_miembro()/is_admin() (helpers de 0003).
-- Trae su propio rollback (0007_fase3_rls.rollback.sql).
-- Aplicar desde el SQL Editor del dashboard de Supabase, después de 0001-0006.

-- ───────────────────────────────────────────────────────────────────────────
-- comercios
-- ───────────────────────────────────────────────────────────────────────────
alter table comercios enable row level security;

create policy comercios_select on comercios
  for select using (es_miembro(id) or is_admin());
-- INSERT directo solo admin (screens/MiNegocioScreen.js). El alta del tendero
-- pasa por la RPC crear_comercio (security definer, bypasea RLS).
create policy comercios_insert_admin on comercios
  for insert with check (is_admin());
create policy comercios_update on comercios
  for update using (es_miembro(id) or is_admin());
create policy comercios_delete_admin on comercios
  for delete using (is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- Catálogo compartido: lectura abierta para cualquier autenticado, escritura
-- solo admin. El tendero ya no crea/edita proveedores_maestro/productos_maestro
-- directo — ver ImportarContactosScreen/PegarPedidoScreen (redirigidos a las
-- colas *_sugeridos de 0003).
-- ───────────────────────────────────────────────────────────────────────────
alter table proveedores_maestro enable row level security;
create policy provmaestro_select on proveedores_maestro for select using (true);
create policy provmaestro_insert_admin on proveedores_maestro for insert with check (is_admin());
create policy provmaestro_update_admin on proveedores_maestro for update using (is_admin());

alter table productos_maestro enable row level security;
create policy prodmaestro_select on productos_maestro for select using (true);
create policy prodmaestro_insert_admin on productos_maestro for insert with check (is_admin());
create policy prodmaestro_update_admin on productos_maestro for update using (is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- relaciones — vínculo comercio↔proveedor. Vincular a un proveedor EXISTENTE
-- es autoservicio del tendero (no toca el catálogo compartido, mismo criterio
-- ya usado para el precio: es dato de la relación).
-- ───────────────────────────────────────────────────────────────────────────
alter table relaciones enable row level security;
create policy relaciones_select on relaciones
  for select using (es_miembro(comercio_id) or is_admin());
create policy relaciones_insert on relaciones
  for insert with check (es_miembro(comercio_id) or is_admin());
create policy relaciones_update on relaciones
  for update using (es_miembro(comercio_id) or is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- productos_relacion — vía relacion_id → relaciones.comercio_id. Igual que
-- relaciones: vincular un producto EXISTENTE a mi relación es autoservicio.
-- ───────────────────────────────────────────────────────────────────────────
alter table productos_relacion enable row level security;

create policy prodrel_select on productos_relacion
  for select using (
    exists (
      select 1 from relaciones r
      where r.id = productos_relacion.relacion_id
        and (es_miembro(r.comercio_id) or is_admin())
    )
  );
create policy prodrel_insert on productos_relacion
  for insert with check (
    exists (
      select 1 from relaciones r
      where r.id = productos_relacion.relacion_id
        and (es_miembro(r.comercio_id) or is_admin())
    )
  );
create policy prodrel_update on productos_relacion
  for update using (
    exists (
      select 1 from relaciones r
      where r.id = productos_relacion.relacion_id
        and (es_miembro(r.comercio_id) or is_admin())
    )
  );
create policy prodrel_delete on productos_relacion
  for delete using (
    exists (
      select 1 from relaciones r
      where r.id = productos_relacion.relacion_id
        and (es_miembro(r.comercio_id) or is_admin())
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- abastecimientos
-- ───────────────────────────────────────────────────────────────────────────
alter table abastecimientos enable row level security;
create policy abast_select on abastecimientos
  for select using (es_miembro(comercio_id) or is_admin());
create policy abast_insert on abastecimientos
  for insert with check (es_miembro(comercio_id) or is_admin());
create policy abast_update on abastecimientos
  for update using (es_miembro(comercio_id) or is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- pedidos — vía abastecimiento_id → abastecimientos.comercio_id.
-- ───────────────────────────────────────────────────────────────────────────
alter table pedidos enable row level security;

create policy pedidos_select on pedidos
  for select using (
    exists (
      select 1 from abastecimientos a
      where a.id = pedidos.abastecimiento_id
        and (es_miembro(a.comercio_id) or is_admin())
    )
  );
create policy pedidos_insert on pedidos
  for insert with check (
    exists (
      select 1 from abastecimientos a
      where a.id = pedidos.abastecimiento_id
        and (es_miembro(a.comercio_id) or is_admin())
    )
  );
create policy pedidos_update on pedidos
  for update using (
    exists (
      select 1 from abastecimientos a
      where a.id = pedidos.abastecimiento_id
        and (es_miembro(a.comercio_id) or is_admin())
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- pedido_items — vía pedido_id → pedidos.abastecimiento_id → comercio.
-- ───────────────────────────────────────────────────────────────────────────
alter table pedido_items enable row level security;

create policy pedidoitems_select on pedido_items
  for select using (
    exists (
      select 1 from pedidos p
      join abastecimientos a on a.id = p.abastecimiento_id
      where p.id = pedido_items.pedido_id
        and (es_miembro(a.comercio_id) or is_admin())
    )
  );
create policy pedidoitems_insert on pedido_items
  for insert with check (
    exists (
      select 1 from pedidos p
      join abastecimientos a on a.id = p.abastecimiento_id
      where p.id = pedido_items.pedido_id
        and (es_miembro(a.comercio_id) or is_admin())
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- sugerencias_cambio_proveedor
-- ───────────────────────────────────────────────────────────────────────────
alter table sugerencias_cambio_proveedor enable row level security;
create policy sugcambio_select on sugerencias_cambio_proveedor
  for select using (es_miembro(comercio_id) or is_admin());
create policy sugcambio_insert on sugerencias_cambio_proveedor
  for insert with check (es_miembro(comercio_id) or is_admin());
-- Aprobar/rechazar es curaduría: solo admin.
create policy sugcambio_update_admin on sugerencias_cambio_proveedor
  for update using (is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- reabastecimiento_ajustes
-- ───────────────────────────────────────────────────────────────────────────
alter table reabastecimiento_ajustes enable row level security;
create policy reabajustes_select on reabastecimiento_ajustes
  for select using (es_miembro(comercio_id) or is_admin());
create policy reabajustes_insert on reabastecimiento_ajustes
  for insert with check (es_miembro(comercio_id) or is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- reabastecimiento_sugerencias
-- ───────────────────────────────────────────────────────────────────────────
alter table reabastecimiento_sugerencias enable row level security;
create policy reabsug_select on reabastecimiento_sugerencias
  for select using (es_miembro(comercio_id) or is_admin());
create policy reabsug_insert on reabastecimiento_sugerencias
  for insert with check (es_miembro(comercio_id) or is_admin());
create policy reabsug_update on reabastecimiento_sugerencias
  for update using (es_miembro(comercio_id) or is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- Endurecer sugerencia_reabastecimiento: hoy NO verifica que quien llama sea
-- miembro del comercio que pasa como parámetro — cualquier tendero autenticado
-- podía pedir la sugerencia de OTRO comercio. Se vuelve security definer (para
-- poder seguir leyendo v_cadencia_producto una vez le revocamos el acceso
-- directo más abajo) con el chequeo de membresía explícito adentro.
-- ───────────────────────────────────────────────────────────────────────────
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (es_miembro(p_comercio_id) or is_admin()) then
    raise exception 'No autorizado para este comercio';
  end if;

  return query
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
end;
$$;

-- v_cadencia_producto nunca debió consultarse directo por REST (sin filtro de
-- comercio); ahora que la RPC es security definer, se le revoca el acceso
-- directo — todo pasa por la RPC, que sí valida membresía.
revoke select on v_cadencia_producto from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC nueva: proveedores recomendados por barrio, sin exponer filas de otros
-- comercios/relaciones al cliente (ProveedoresTabScreen hacía Comercios.listar()
-- + Relaciones.listar() sin filtro para esto — bajo RLS ya no puede).
-- Devuelve solo proveedor_id (dato ya público vía proveedores_maestro).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function proveedores_recomendados_barrio(p_comercio_id uuid)
returns table (proveedor_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (es_miembro(p_comercio_id) or is_admin()) then
    raise exception 'No autorizado para este comercio';
  end if;

  return query
  select distinct r.proveedor_id
  from relaciones r
  join comercios c on c.id = r.comercio_id
  where c.id <> p_comercio_id
    and c.barrio is not null
    and c.barrio = (select barrio from comercios where id = p_comercio_id);
end;
$$;

comment on function proveedores_recomendados_barrio is
  'IDs de proveedores usados por otros comercios del mismo barrio. No expone identidad ni datos de contacto de esos comercios.';
