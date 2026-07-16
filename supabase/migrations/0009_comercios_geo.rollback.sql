-- Rollback de 0009: quita las columnas de geolocalización de comercios.
-- OJO: si 0010 (motor de cobertura) ya está aplicada, hay que revertir 0010
-- primero — sus vistas materializadas dependen de estas columnas.
alter table comercios drop column if exists lat;
alter table comercios drop column if exists lng;
