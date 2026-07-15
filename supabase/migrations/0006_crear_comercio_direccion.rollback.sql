-- Rollback de 0006: restaura crear_comercio a la versión de 4 argumentos (0003).
-- Nota: hay que dropear la versión de 6 argumentos explícitamente porque Postgres
-- permite overloads por firma distinta (create or replace no la reemplaza sola).

drop function if exists crear_comercio(text, text, text, integer, text, text);

create or replace function crear_comercio(
  p_nombre text, p_barrio text, p_telefono text, p_proveedores_totales int
)
returns comercios
language plpgsql security definer set search_path = public as $$
declare c comercios;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercios (nombre, barrio, telefono, proveedores_totales)
    values (p_nombre, p_barrio, p_telefono, p_proveedores_totales)
    returning * into c;
  insert into comercio_miembros (comercio_id, user_id, rol)
    values (c.id, auth.uid(), 'dueño');
  return c;
end; $$;
