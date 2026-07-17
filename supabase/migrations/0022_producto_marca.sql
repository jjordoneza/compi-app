-- Separa marca de nombre en productos_maestro: mejora el matching por
-- similitud (pg_trgm) porque comparar la marca sola es más confiable que
-- comparar el string completo con la presentación mezclada adentro. Sin
-- backfill automático a propósito — un regex de "primera palabra del nombre"
-- mal calibrado ensucia el catálogo con marcas incorrectas, peor que null.
-- Queda null para lo existente y se completa vía curaduría con el tiempo.
alter table productos_maestro add column if not exists marca text;

comment on column productos_maestro.marca is 'Marca del producto (ej. "Coca-Cola"), separada de nombre para mejorar el matching por similitud. Nullable — sin backfill automático, se completa vía curaduría.';
