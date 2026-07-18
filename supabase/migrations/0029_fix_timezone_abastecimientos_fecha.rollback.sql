-- Revierte a timestamp sin zona horaria (comportamiento previo, con el bug
-- de desfase de hora). Usa AT TIME ZONE 'UTC' en sentido inverso para volver
-- al mismo valor "pelado" que había antes.
alter table abastecimientos
  alter column fecha type timestamp without time zone using fecha at time zone 'UTC';

alter table abastecimientos
  alter column fecha set default now();

comment on column abastecimientos.fecha is null;
