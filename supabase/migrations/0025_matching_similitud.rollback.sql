drop function if exists buscar_producto_similar(text, text, numeric);
drop function if exists buscar_proveedor_similar(text, numeric);
drop index if exists idx_productos_maestro_nombre_trgm;
drop index if exists idx_proveedores_maestro_nombre_trgm;
-- No se dropea la extensión pg_trgm: podría estar en uso por otra cosa y
-- dropearla es una operación más amplia que lo que esta migración agregó.
