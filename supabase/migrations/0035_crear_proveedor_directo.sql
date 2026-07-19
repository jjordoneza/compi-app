-- Nueva pantalla en la app (CrearProveedorScreen): hasta hoy la única forma de
-- crear un proveedor era Importar Contactos. El tendero ahora puede proponer
-- uno directo desde "Agregar proveedor" → "Crear proveedor nuevo", capturando
-- los mismos datos que hoy solo el admin ve/cura en Maestro de proveedores
-- (celular, contacto, teléfono secundario, barrio, ciudad, dirección). Sigue
-- pasando por curaduría igual que nombre/categoria — el admin puede corregir
-- antes o después de aprobar. Esto NO cambia la decisión de 0031/0033 de que
-- el tendero no propone cambios de ubicación/contacto de un proveedor YA
-- EXISTENTE — aquí el proveedor todavía no existe, es la única fuente de este
-- dato al momento de crearlo.
alter table proveedores_sugeridos add column if not exists contacto_nombre text;
alter table proveedores_sugeridos add column if not exists telefono_secundario text;
alter table proveedores_sugeridos add column if not exists barrio text;
alter table proveedores_sugeridos add column if not exists ciudad text;
alter table proveedores_sugeridos add column if not exists direccion text;

comment on column proveedores_sugeridos.contacto_nombre is 'Capturado al crear un proveedor nuevo directo (CrearProveedorScreen). Se copia a proveedores_maestro al aprobar si se crea uno nuevo.';
comment on column proveedores_sugeridos.telefono_secundario is 'Idem contacto_nombre.';
comment on column proveedores_sugeridos.barrio is 'Idem contacto_nombre.';
comment on column proveedores_sugeridos.ciudad is 'Idem contacto_nombre.';
comment on column proveedores_sugeridos.direccion is 'Idem contacto_nombre.';

-- aprobar_proveedor_sugerido: mismo cuerpo de 0023 + copiar los campos nuevos
-- a proveedores_maestro cuando se crea uno nuevo (p_proveedor_maestro_id es
-- null). Si el admin vincula a uno existente, esos campos del sugerido se
-- ignoran (el maestro ya tiene su propia data, curada aparte). Firma sin
-- cambios → create or replace es seguro.
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

comment on function aprobar_proveedor_sugerido is 'Aprueba una sugerencia de proveedor: crea (copiando telefono/contacto/ubicacion del sugerido) o vincula proveedores_maestro, y crea/reactiva la relación. Solo admin.';
