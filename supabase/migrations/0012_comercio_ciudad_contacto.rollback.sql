-- Rollback de 0012: vuelve crear_comercio a su firma de 6 argumentos (0006) y
-- quita ciudad/contacto_nombre. Aplicar solo si nada más depende ya del
-- registro de estos 2 campos.
drop function if exists crear_comercio(text, text, text, integer, text, text, text, text);

create or replace function crear_comercio(
  p_nombre text,
  p_barrio text,
  p_telefono text,
  p_proveedores_totales int,
  p_direccion text default null,
  p_detalles text default null
)
returns comercios
language plpgsql security definer set search_path = public as $$
declare c comercios;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercios (nombre, barrio, telefono, proveedores_totales, direccion, detalles)
    values (p_nombre, p_barrio, p_telefono, p_proveedores_totales, p_direccion, p_detalles)
    returning * into c;
  insert into comercio_miembros (comercio_id, user_id, rol)
    values (c.id, auth.uid(), 'dueño');
  return c;
end; $$;

alter table comercios drop column if exists ciudad;
alter table comercios drop column if exists contacto_nombre;
