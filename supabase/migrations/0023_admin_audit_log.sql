-- Registro de auditoría de acciones del admin. Hoy solo hay un admin, pero en
-- cuanto haya un segundo o alguien de soporte con este acceso, se necesita
-- saber quién hizo qué y cuándo — bajo riesgo de reconstruir mal si no se
-- captura desde ahora. Se instrumenta como mínimo las 8 RPCs de
-- aprobación/rechazo de curaduría que ya existen (0011 y 0013). Sin pantalla
-- de lectura por ahora — se consulta por SQL Editor hasta que haga falta.
create table if not exists admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid references auth.users(id),
  accion          text not null,
  tabla_afectada  text not null,
  registro_id     uuid,
  detalle         jsonb,
  created_at      timestamptz not null default now()
);

alter table admin_audit_log enable row level security;

-- Solo lectura para admin. Sin política de insert/update/delete para
-- authenticated: las únicas escrituras válidas vienen de las RPCs
-- security definer de abajo, que no pasan por RLS de PostgREST.
create policy admin_audit_log_select on admin_audit_log
  for select using (is_admin());

comment on table admin_audit_log is 'Auditoría de acciones del admin (aprobaciones/rechazos de curaduría como mínimo). Solo escriben las RPCs de aprobación/rechazo. Solo admin puede leer.';

-- ───────────────────────────────────────────────────────────────────────────
-- Instrumentación: mismo cuerpo de cada RPC de 0011/0013 + 1 insert al final.
-- Firma sin cambios en las 8, así que "create or replace" es seguro (no deja
-- overloads huérfanos, no rompe a quien ya las llama).
-- ───────────────────────────────────────────────────────────────────────────

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

create or replace function aprobar_cambio_numero_proveedor(p_sugerencia_id uuid)
returns proveedores_maestro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug sugerencias_cambio_proveedor;
  v_prov proveedores_maestro;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from sugerencias_cambio_proveedor where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  update proveedores_maestro set telefono = v_sug.telefono_sugerido
    where id = v_sug.proveedor_id
    returning * into v_prov;

  update sugerencias_cambio_proveedor set estado = 'aprobada' where id = p_sugerencia_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_cambio_numero_proveedor', 'sugerencias_cambio_proveedor', p_sugerencia_id,
      jsonb_build_object('proveedor_id', v_sug.proveedor_id, 'telefono_sugerido', v_sug.telefono_sugerido));

  return v_prov;
end;
$$;

create or replace function rechazar_cambio_numero_proveedor(
  p_sugerencia_id uuid,
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

  select estado into v_estado from sugerencias_cambio_proveedor where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update sugerencias_cambio_proveedor
    set estado = 'rechazada', motivo_rechazo = p_motivo
    where id = p_sugerencia_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_cambio_numero_proveedor', 'sugerencias_cambio_proveedor', p_sugerencia_id,
      jsonb_build_object('motivo', p_motivo));
end;
$$;

create or replace function aprobar_cambio_comercio(p_sugerencia_id uuid)
returns comercios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug sugerencias_cambio_comercio;
  v_com comercios;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from sugerencias_cambio_comercio where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  update comercios set
    telefono = coalesce(v_sug.telefono_sugerido, telefono),
    contacto_nombre = coalesce(v_sug.contacto_nombre_sugerido, contacto_nombre)
    where id = v_sug.comercio_id
    returning * into v_com;

  update sugerencias_cambio_comercio set estado = 'aprobada' where id = p_sugerencia_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_cambio_comercio', 'sugerencias_cambio_comercio', p_sugerencia_id,
      jsonb_build_object('comercio_id', v_sug.comercio_id, 'telefono_sugerido', v_sug.telefono_sugerido));

  return v_com;
end;
$$;

create or replace function rechazar_cambio_comercio(
  p_sugerencia_id uuid,
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

  select estado into v_estado from sugerencias_cambio_comercio where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update sugerencias_cambio_comercio
    set estado = 'rechazada', motivo_rechazo = p_motivo
    where id = p_sugerencia_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'rechazar_cambio_comercio', 'sugerencias_cambio_comercio', p_sugerencia_id,
      jsonb_build_object('motivo', p_motivo));
end;
$$;
