-- Rollback de 0041_notificaciones_curaduria.sql — revierte las 4 funciones a
-- su cuerpo exacto de antes (0035/0024/0023), sin el insert en notificaciones.

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
    insert into proveedores_maestro (nombre, categoria, telefono, contacto_nombre, telefono_secundario, barrio, ciudad, direccion)
      values (v_sug.nombre, coalesce(v_sug.categoria, ''), v_sug.telefono, v_sug.contacto_nombre, v_sug.telefono_secundario, v_sug.barrio, v_sug.ciudad, v_sug.direccion)
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

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_proveedor_sugerido', 'proveedores_sugeridos', p_sugerido_id,
      jsonb_build_object('proveedor_maestro_id', v_prov.id, 'creado_nuevo', p_proveedor_maestro_id is null));

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

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_proveedor_sugerido', 'proveedores_sugeridos', p_sugerido_id,
      jsonb_build_object('motivo', p_motivo));
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
    insert into productos_maestro (nombre, presentacion, categoria, unidad_base, marca)
      values (v_sug.nombre, v_sug.presentacion, coalesce(v_sug.categoria, ''), v_sug.unidad_base, v_sug.marca)
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
    insert into productos_relacion (relacion_id, producto_id, precio_pactado, presentacion, factor_conversion, unidad_pedido)
      values (v_sug.relacion_id, v_prod.id, v_sug.precio_pactado, v_sug.presentacion, coalesce(v_sug.factor_conversion, 1), v_sug.unidad_pedido);
  else
    update productos_relacion
      set precio_pactado = coalesce(v_sug.precio_pactado, precio_pactado),
          presentacion = coalesce(v_sug.presentacion, presentacion),
          factor_conversion = coalesce(v_sug.factor_conversion, factor_conversion),
          unidad_pedido = coalesce(v_sug.unidad_pedido, unidad_pedido)
      where id = v_existe;
  end if;

  update productos_sugeridos
    set estado = 'aprobado', producto_maestro_id = v_prod.id
    where id = p_sugerido_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_producto_sugerido', 'productos_sugeridos', p_sugerido_id,
      jsonb_build_object('producto_maestro_id', v_prod.id, 'creado_nuevo', p_producto_maestro_id is null));

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

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_producto_sugerido', 'productos_sugeridos', p_sugerido_id,
      jsonb_build_object('motivo', p_motivo));
end;
$$;
