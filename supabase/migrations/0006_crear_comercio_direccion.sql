-- Extiende crear_comercio (0003) para aceptar direccion/detalles (0005).
-- Aplicar desde el SQL Editor del dashboard de Supabase (después de 0003 y 0005).
--
-- OJO: cambia la firma (4 → 6 argumentos). "create or replace" NO reemplaza una
-- función cuando cambia la firma — crea un overload nuevo y deja la vieja de 4
-- argumentos huérfana en el esquema. Por eso se dropea explícitamente primero.

drop function if exists crear_comercio(text, text, text, integer);

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
