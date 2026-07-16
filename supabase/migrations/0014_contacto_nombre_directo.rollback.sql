-- Rollback de 0014: re-agrega contacto_nombre_sugerido y revierte
-- aprobar_cambio_comercio a coalesce ambos campos (comportamiento de 0013).
alter table sugerencias_cambio_comercio add column if not exists contacto_nombre_sugerido text;

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

  return v_com;
end;
$$;
