-- Prerrequisito del motor de confianza de cobertura de proveedores: coordenadas
-- del comercio, capturadas en automático (GPS del dispositivo) al registrar el
-- negocio. Nullable — nunca bloquea el registro si el permiso se niega o falla.
alter table comercios add column if not exists lat double precision;
alter table comercios add column if not exists lng double precision;

comment on column comercios.lat is
  'Latitud capturada por GPS al crear el negocio (best-effort, puede ser null). No se le muestra al tendero — solo alimenta el motor de cobertura de proveedores.';
comment on column comercios.lng is
  'Longitud capturada por GPS al crear el negocio (best-effort, puede ser null).';
