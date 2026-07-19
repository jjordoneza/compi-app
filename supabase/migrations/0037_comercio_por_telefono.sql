-- comercio_por_telefono — aviso "¿es tu negocio?" al registrar (gap P3 #7).
-- comercios.telefono no tiene (ni tendrá) constraint unique: multi-comercio
-- por el mismo dueño es una función intencional (SeleccionarNegocioScreen) y
-- cada negocio nuevo reusa el mismo teléfono OTP del dueño — un unique
-- rompería ese flujo. Este RPC es de solo-aviso, nunca bloquea: excluye a
-- propósito los comercios del propio usuario (es_miembro) para no dispararse
-- en el caso normal de multi-comercio, y solo importa cuando el teléfono ya
-- es de un comercio de OTRO dueño (duplicado real o alguien reclamando un
-- negocio ajeno por error).
create or replace function comercio_por_telefono(p_telefono text)
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;

  return query
  select c.id, c.nombre
  from comercios c
  where c.telefono = p_telefono
    and c.activo
    and not es_miembro(c.id)
  limit 5;
end;
$$;

comment on function comercio_por_telefono is 'Comercios activos ya registrados con este teléfono, excluyendo los del propio usuario (multi-comercio no debe disparar el aviso). Solo expone id/nombre — usado para el aviso "¿es tu negocio? Únete en vez de crear uno nuevo" en RegistroNegocioScreen. Nunca bloquea el registro.';
