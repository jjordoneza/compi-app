-- Fase 4 (gap #4 / gap #2 fusionado): RPCs de aprobación/rechazo para las 2
-- pantallas mínimas de curaduría admin (apps/admin-web/). Antes de esto, la
-- única forma de resolver proveedores_sugeridos/productos_sugeridos era SQL
-- Editor a mano — puente aceptado solo mientras el único usuario probando era
-- el dueño del proyecto.
--
-- motivo_rechazo: nota interna del admin al rechazar. No hay pantalla que se
-- la muestre al tendero todavía (gap aparte) — por ahora es solo trazabilidad.

alter table proveedores_sugeridos add column if not exists motivo_rechazo text;
alter table productos_sugeridos add column if not exists motivo_rechazo text;

-- ───────────────────────────────────────────────────────────────────────────
-- aprobar_proveedor_sugerido — crea (o reutiliza, si el admin encontró que ya
-- existía) la fila en proveedores_maestro, y crea/reactiva la relación
-- comercio↔proveedor. Mismo patrón de reactivar-antes-que-duplicar que ya usa
-- AgregarProveedorScreen.js en el cliente.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function aprobar_proveedor_sugerido(
  p_sugerido_id uuid,
  p_proveedor_maestro_id uuid default null -- null = crear nuevo; no-null = ya existía, vincular
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
    set estado = 'aprobado', proveedor_maestro_id = v_prov.id
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
    set estado = 'rechazado', motivo_rechazo = p_motivo
    where id = p_sugerido_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- aprobar_producto_sugerido — crea (o reutiliza) la fila en productos_maestro,
-- y crea la productos_relacion con el precio_pactado que el tendero ya había
-- tecleado (no se pierde en la aprobación — gap #1 ya decidió que el precio es
-- dato de la relación, no de curaduría). Si la relación ya tenía ese producto
-- (reenvío duplicado), actualiza el precio en vez de duplicar la fila.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function aprobar_producto_sugerido(
  p_sugerido_id uuid,
  p_producto_maestro_id uuid default null -- null = crear nuevo; no-null = ya existía, vincular
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
    set estado = 'aprobado', producto_maestro_id = v_prod.id
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
    set estado = 'rechazado', motivo_rechazo = p_motivo
    where id = p_sugerido_id;
end;
$$;

comment on function aprobar_proveedor_sugerido is 'Aprueba una sugerencia de proveedor: crea o vincula proveedores_maestro y crea/reactiva la relación. Solo admin.';
comment on function rechazar_proveedor_sugerido is 'Rechaza una sugerencia de proveedor, con motivo opcional. Solo admin.';
comment on function aprobar_producto_sugerido is 'Aprueba una sugerencia de producto: crea o vincula productos_maestro y crea/actualiza productos_relacion con el precio pactado. Solo admin.';
comment on function rechazar_producto_sugerido is 'Rechaza una sugerencia de producto, con motivo opcional. Solo admin.';
