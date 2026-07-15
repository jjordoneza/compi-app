-- Rollback de 0004: restaura reclamar_comercios_por_telefono a la versión de 0003
-- (comparación exacta de string c.telefono = u.phone).

create or replace function reclamar_comercios_por_telefono()
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercio_miembros (comercio_id, user_id, rol)
    select c.id, auth.uid(), 'dueño'
    from comercios c
    join auth.users u on u.id = auth.uid()
    where c.telefono = u.phone
      and not exists (
        select 1 from comercio_miembros m
        where m.comercio_id = c.id and m.user_id = auth.uid()
      );
  get diagnostics n = row_count;
  return n;
end; $$;
