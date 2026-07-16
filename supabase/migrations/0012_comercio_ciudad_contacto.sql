-- "Maestro negocios" (panel admin) necesita ciudad y nombre de contacto para
-- ser un maestro consolidado real. Se capturan desde el registro del negocio,
-- no se agregan después a mano — mismo principio que direccion/detalles (0005).
alter table comercios add column if not exists ciudad text;
alter table comercios add column if not exists contacto_nombre text;

comment on column comercios.ciudad is 'Ciudad del negocio, ej. Bogotá. Nullable — comercios registrados antes de este cambio no la tienen (backfill pendiente, igual que lat/lng en 0009).';
comment on column comercios.contacto_nombre is 'Nombre de la persona de contacto del negocio (puede diferir del nombre del negocio, ej. "Tienda Juan" vs "Juan Pérez").';

-- Extiende crear_comercio (0006) para aceptar ciudad/contacto_nombre.
-- OJO: cambia la firma (6 → 8 argumentos) — "create or replace" NO reemplaza
-- una función cuando cambia la firma, crea un overload nuevo y deja la vieja
-- huérfana. Se dropea explícitamente primero (mismo cuidado que ya tomó 0006).
drop function if exists crear_comercio(text, text, text, integer, text, text);

create or replace function crear_comercio(
  p_nombre text,
  p_barrio text,
  p_telefono text,
  p_proveedores_totales int,
  p_direccion text default null,
  p_detalles text default null,
  p_ciudad text default null,
  p_contacto_nombre text default null
)
returns comercios
language plpgsql security definer set search_path = public as $$
declare c comercios;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercios (nombre, barrio, telefono, proveedores_totales, direccion, detalles, ciudad, contacto_nombre)
    values (p_nombre, p_barrio, p_telefono, p_proveedores_totales, p_direccion, p_detalles, p_ciudad, p_contacto_nombre)
    returning * into c;
  insert into comercio_miembros (comercio_id, user_id, rol)
    values (c.id, auth.uid(), 'dueño');
  return c;
end; $$;
