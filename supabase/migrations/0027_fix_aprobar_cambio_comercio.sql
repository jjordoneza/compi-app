-- Fix: aprobar_cambio_comercio (redefinida en 0023 para agregar el insert de
-- auditoría) quedó con un cuerpo copiado de ANTES de 0014, que sigue
-- referenciando sugerencias_cambio_comercio.contacto_nombre_sugerido — esa
-- columna se eliminó en 0014 (el nombre de contacto pasó a ser autoservicio
-- directo, solo el teléfono queda en la cola de aprobación). Cualquier
-- llamada a esta RPC revienta en tiempo de ejecución con "record v_sug has no
-- field contacto_nombre_sugerido", detectado por auditoría de código antes de
-- ejecutarse en producción. Esta migración solo corrige el cuerpo (misma
-- firma), quitando esa línea y manteniendo el insert de auditoría de 0023.
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
    telefono = coalesce(v_sug.telefono_sugerido, telefono)
    where id = v_sug.comercio_id
    returning * into v_com;

  update sugerencias_cambio_comercio set estado = 'aprobada' where id = p_sugerencia_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_cambio_comercio', 'sugerencias_cambio_comercio', p_sugerencia_id,
      jsonb_build_object('comercio_id', v_sug.comercio_id, 'telefono_sugerido', v_sug.telefono_sugerido));

  return v_com;
end;
$$;
