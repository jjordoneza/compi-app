-- Fix: la hora mostrada en el historial de pedidos no coincidía con la hora
-- real del pedido. Causa confirmada por el usuario (information_schema.columns):
-- abastecimientos.fecha es `timestamp without time zone` — Postgres la guarda
-- "tal cual", sin zona horaria, así que el cliente (new Date(ab.fecha).toLocaleString())
-- puede interpretarla mal según en qué zona horaria corrió la sesión que la leyó.
--
-- Supabase corre sus instancias de Postgres con timezone de sesión en UTC por
-- defecto (confirmable con `show timezone;`), y como el cliente nunca manda
-- `fecha` explícito (Abastecimientos.crear no la incluye, así que sale del
-- default de la columna), los valores ya guardados son, en la práctica, la
-- hora UTC "pelada". `AT TIME ZONE 'UTC'` reinterpreta esos valores como UTC
-- y les asigna la zona horaria correcta al convertir a timestamptz — no
-- desplaza el instante, solo lo etiqueta correctamente.
alter table abastecimientos
  alter column fecha type timestamptz using fecha at time zone 'UTC';

alter table abastecimientos
  alter column fecha set default now();

comment on column abastecimientos.fecha is 'timestamptz (corregido 18 jul 2026 — antes timestamp sin zona horaria, causaba desfase de hora en el historial). Guarda el momento de creación del abastecimiento.';
