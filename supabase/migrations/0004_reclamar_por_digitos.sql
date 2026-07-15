-- Gap #2 · Fase 1 (fix) — reclamar_comercios_por_telefono robusto al formato.
-- Reemplaza la comparación exacta de string (c.telefono = u.phone) por una que
-- ignora '+', espacios, guiones Y el código de país: compara los ÚLTIMOS 10
-- dígitos (el número nacional colombiano). Así funciona aunque comercios.telefono
-- esté crudo (ej. '3001234567') y auth.users.phone en E.164 (ej. '+573001234567').
-- Aplicar desde el SQL Editor del dashboard (después de 0003).

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
    where c.telefono is not null
      and u.phone is not null
      -- solo comparar cuando ambos tienen al menos 10 dígitos (evita falsos
      -- positivos entre teléfonos basura/cortos)
      and length(regexp_replace(c.telefono, '\D', '', 'g')) >= 10
      and length(regexp_replace(u.phone,     '\D', '', 'g')) >= 10
      and right(regexp_replace(c.telefono, '\D', '', 'g'), 10)
        = right(regexp_replace(u.phone,     '\D', '', 'g'), 10)
      and not exists (
        select 1 from comercio_miembros m
        where m.comercio_id = c.id and m.user_id = auth.uid()
      );

  get diagnostics n = row_count;
  return n;
end; $$;

comment on function reclamar_comercios_por_telefono is
  'Vincula comercios sembrados al usuario actual comparando los últimos 10 dígitos del teléfono (ignora +, espacios y código de país). Asume número nacional colombiano de 10 dígitos.';
