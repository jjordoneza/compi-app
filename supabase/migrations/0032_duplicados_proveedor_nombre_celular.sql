-- Detección de duplicados de proveedor por nombre+celular (decisión de
-- producto, 18 jul 2026): coincidencia de nombre sola NO basta para
-- auto-aprobar — debe cruzarse con el celular. Si el celular coincide EXACTO
-- y el nombre es parecido (similarity >= umbral), se auto-vincula al
-- proveedor_maestro existente (el "más validado") sin pasar por curaduría
-- manual. Si solo coincide el nombre sin el celular, sigue el flujo normal
-- de revisión del admin — sin cambios ahí.

-- proveedores_sugeridos no tenía teléfono — ImportarContactosScreen ahora lo
-- captura del contacto para poder cruzarlo.
alter table proveedores_sugeridos add column if not exists telefono text;

-- security definer + chequeo es_miembro (no is_admin): a diferencia de
-- aprobar_proveedor_sugerido (solo-admin), esta la llama la propia app del
-- tendero — el "aprobar" aquí es automático y de alta confianza (celular
-- exacto + nombre similar), no una decisión humana.
create or replace function intentar_auto_vincular_proveedor(
  p_comercio_id uuid,
  p_nombre text,
  p_telefono text,
  p_categoria text default null,
  p_canal text default null,
  p_umbral numeric default 0.35
)
returns table (proveedor_id uuid, proveedor_nombre text, relacion_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prov proveedores_maestro;
  v_relacion_id uuid;
  v_activo boolean;
  v_telefono_limpio text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  if not es_miembro(p_comercio_id) then
    raise exception 'No autorizado';
  end if;

  -- Sin celular no hay nada que cruzar — cae al flujo manual normal (el
  -- cliente decide insertar en proveedores_sugeridos como 'pendiente').
  if v_telefono_limpio = '' then
    return;
  end if;

  select pm.* into v_prov
  from proveedores_maestro pm
  where regexp_replace(coalesce(pm.telefono, ''), '\D', '', 'g') = v_telefono_limpio
    and similarity(pm.nombre, p_nombre) >= p_umbral
  order by similarity(pm.nombre, p_nombre) desc
  limit 1;

  if not found then
    return;
  end if;

  select id, activo into v_relacion_id, v_activo from relaciones
    where comercio_id = p_comercio_id and proveedor_id = v_prov.id
    limit 1;

  if v_relacion_id is null then
    insert into relaciones (comercio_id, proveedor_id) values (p_comercio_id, v_prov.id)
      returning id into v_relacion_id;
  elsif not v_activo then
    update relaciones set activo = true where id = v_relacion_id;
  end if;

  -- Registro auditable del auto-match, mismo patrón que si un admin lo
  -- hubiera aprobado a mano.
  insert into proveedores_sugeridos
    (comercio_id, sugerido_por, nombre, categoria, canal, telefono, estado, proveedor_maestro_id)
    values (p_comercio_id, auth.uid(), p_nombre, p_categoria, p_canal, p_telefono, 'aprobado', v_prov.id);

  return query select v_prov.id, v_prov.nombre, v_relacion_id;
end;
$$;

comment on function intentar_auto_vincular_proveedor is 'Auto-vincula un proveedor propuesto (Importar contactos) al proveedor_maestro existente cuando el celular coincide exacto Y el nombre es similar — sin curaduría manual. Si no hay match, no hace nada y el cliente cae al flujo normal de proveedores_sugeridos pendiente.';
