-- Corrección de diseño sobre 0013: "nombre de quien atiende" es dato de bajo
-- riesgo (igual que nombre/ciudad/barrio/dirección) — el tendero lo edita
-- directo, sin curaduría. Solo el teléfono de contacto sigue pasando por
-- aprobación. sugerencias_cambio_comercio deja de cargar
-- contacto_nombre_sugerido.
alter table sugerencias_cambio_comercio drop column if exists contacto_nombre_sugerido;

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

  update comercios set telefono = v_sug.telefono_sugerido
    where id = v_sug.comercio_id
    returning * into v_com;

  update sugerencias_cambio_comercio set estado = 'aprobada' where id = p_sugerencia_id;

  return v_com;
end;
$$;

comment on table sugerencias_cambio_comercio is 'Cambios de teléfono de contacto del negocio propuestos por el tendero — requiere aprobación admin. nombre/ciudad/barrio/dirección/nombre de contacto se editan directo, sin esta cola.';
