-- "Eliminar proveedor": si la relación ya tiene pedidos en el historial, no se
-- puede borrar de verdad sin perder ese historial — se desactiva en vez de
-- eliminarse. Si nunca tuvo pedidos, la app sigue haciendo un DELETE real.
-- Postgres rellena esta columna con `true` en las filas existentes al agregarla
-- (NOT NULL + DEFAULT), así que ningún proveedor actual queda desactivado.
alter table relaciones add column if not exists activo boolean not null default true;

comment on column relaciones.activo is
  'false = el tendero "eliminó" este proveedor pero ya tenía pedidos, así que se desactivó en vez de borrarse. El historial (pedidos, abastecimientos) sigue intacto y sigue resolviendo nombre/precio a través de esta relación.';
