-- Registro de negocio completo: dirección y observaciones del comercio.
-- Aplicar desde el SQL Editor del dashboard de Supabase.

alter table comercios
  add column if not exists direccion text,
  add column if not exists detalles text;

comment on column comercios.direccion is 'Dirección completa del negocio (calle, número).';
comment on column comercios.detalles is 'Observaciones de ubicación: apto, torre, urbanización, etc.';
