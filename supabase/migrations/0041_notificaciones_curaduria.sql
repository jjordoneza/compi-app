-- Notificar al tendero cuando su sugerencia de producto o proveedor (cola de
-- curaduría, migración 0011 + retoques posteriores) se aprueba o rechaza —
-- hoy el tendero no se entera nunca, tiene que volver a abrir la app y fijarse
-- si el pill de estado cambió. Deferido a propósito en la migración 0039
-- ("toca 4 RPCs ya revisadas varias veces") — se retoma ahora.
--
-- Mismo patrón que avanzar_estado_pedido (migración 0039): el insert en
-- notificaciones queda envuelto en su propio begin/exception, para que un
-- fallo ahí nunca tumbe la aprobación/rechazo real (lo crítico).
--
-- CREATE OR REPLACE con el cuerpo más reciente de cada función (aprobar_
-- proveedor_sugerido de la 0035, rechazar_proveedor_sugerido y rechazar_
-- producto_sugerido de la 0023, aprobar_producto_sugerido de la 0024) + el
-- bloque de notificación al final. Ninguna firma cambia.

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

  begin
    insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
      values (
        v_sug.comercio_id, 'curaduria_proveedor_aprobado', 'Proveedor aprobado',
        '"' || v_prov.nombre || '" ya está en tu lista de proveedores.',
        jsonb_build_object('sugerido_id', p_sugerido_id, 'proveedor_maestro_id', v_prov.id)
      );
  exception when others then
    null; -- nunca bloquea la aprobación por un fallo de notificación
  end;

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
  v_sug proveedores_sugeridos;
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

  update proveedores_sugeridos
    set estado = 'rechazado', motivo_rechazo = p_motivo
    where id = p_sugerido_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_proveedor_sugerido', 'proveedores_sugeridos', p_sugerido_id,
      jsonb_build_object('motivo', p_motivo));

  begin
    insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
      values (
        v_sug.comercio_id, 'curaduria_proveedor_rechazado', 'Proveedor no aprobado',
        'No pudimos agregar "' || v_sug.nombre || '" a tu lista de proveedores.'
          || case when p_motivo is not null then ' Motivo: ' || p_motivo else '' end,
        jsonb_build_object('sugerido_id', p_sugerido_id)
      );
  exception when others then
    null;
  end;
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
  v_comercio_id uuid;
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

  begin
    select r.comercio_id into v_comercio_id from relaciones r where r.id = v_sug.relacion_id;
    insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
      values (
        v_comercio_id, 'curaduria_producto_aprobado', 'Producto aprobado',
        '"' || v_prod.nombre || '" ya está disponible en tu pedido.',
        jsonb_build_object('sugerido_id', p_sugerido_id, 'producto_maestro_id', v_prod.id)
      );
  exception when others then
    null;
  end;

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
  v_sug productos_sugeridos;
  v_comercio_id uuid;
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

  update productos_sugeridos
    set estado = 'rechazado', motivo_rechazo = p_motivo
    where id = p_sugerido_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_producto_sugerido', 'productos_sugeridos', p_sugerido_id,
      jsonb_build_object('motivo', p_motivo));

  begin
    select r.comercio_id into v_comercio_id from relaciones r where r.id = v_sug.relacion_id;
    insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
      values (
        v_comercio_id, 'curaduria_producto_rechazado', 'Producto no aprobado',
        'No pudimos agregar "' || v_sug.nombre || '" a tu catálogo.'
          || case when p_motivo is not null then ' Motivo: ' || p_motivo else '' end,
        jsonb_build_object('sugerido_id', p_sugerido_id)
      );
  exception when others then
    null;
  end;
end;
$$;

comment on function aprobar_proveedor_sugerido is 'Aprueba una sugerencia de proveedor: crea (copiando telefono/contacto/ubicacion del sugerido) o vincula proveedores_maestro, crea/reactiva la relación, y notifica al tendero. Solo admin.';
comment on function rechazar_proveedor_sugerido is 'Rechaza una sugerencia de proveedor, con motivo opcional, y notifica al tendero. Solo admin.';
comment on function aprobar_producto_sugerido is 'Aprueba una sugerencia de producto: crea o vincula productos_maestro y crea/actualiza productos_relacion con el precio pactado, y notifica al tendero. Solo admin.';
comment on function rechazar_producto_sugerido is 'Rechaza una sugerencia de producto, con motivo opcional, y notifica al tendero. Solo admin.';
