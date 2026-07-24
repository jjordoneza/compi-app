-- Rollback de 0043_estadisticas_mercado.sql

drop function if exists estadisticas_mercado_productos(text, integer);
drop function if exists estadisticas_mercado_zonas(uuid, text, integer);
