-- Rollback de 0035: vuelve aprobar_proveedor_sugerido al cuerpo de 0023 (sin
-- copiar contacto/ubicación al crear) y quita las columnas nuevas de
-- proveedores_sugeridos.
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

comment on function aprobar_proveedor_sugerido is 'Aprueba una sugerencia de proveedor: crea o vincula proveedores_maestro y crea/reactiva la relación. Solo admin.';

alter table proveedores_sugeridos drop column if exists contacto_nombre;
alter table proveedores_sugeridos drop column if exists telefono_secundario;
alter table proveedores_sugeridos drop column if exists barrio;
alter table proveedores_sugeridos drop column if exists ciudad;
alter table proveedores_sugeridos drop column if exists direccion;
