-- Fix: la búsqueda de "¿ya existe en el catálogo?" (AprobacionPanel, admin-web)
-- no mostraba resultados hasta escribir varias letras (ej. "panadería" recién
-- aparecía al llegar a "panad"). No era un bug de debounce — el componente ya
-- busca en cada tecla — sino una propiedad esperada de similarity() (pg_trgm):
-- un prefijo corto comparte pocos trigramas con la palabra completa, así que
-- su similitud queda por debajo del umbral hasta que hay suficiente texto.
--
-- Se agrega un OR con ILIKE de prefijo: cubre la búsqueda incremental desde la
-- primera letra (substring exacto), mientras similarity() se mantiene como red
-- adicional para variantes con errores de tipeo o nombres no coincidentes al
-- inicio. No se quita nada, solo se amplía el criterio de match.
create or replace function buscar_producto_similar(
  p_nombre text,
  p_unidad_base text default null,
  p_umbral numeric default 0.35
)
returns table (
  id uuid,
  nombre text,
  presentacion text,
  categoria text,
  marca text,
  unidad_base text,
  similitud numeric
)
language sql
stable
set search_path = public, extensions
as $$
  select pm.id, pm.nombre, pm.presentacion, pm.categoria, pm.marca, pm.unidad_base,
    similarity(pm.nombre, p_nombre)::numeric as similitud
  from productos_maestro pm
  where (p_unidad_base is null or pm.unidad_base is null or pm.unidad_base = p_unidad_base)
    and (pm.nombre ilike p_nombre || '%' or similarity(pm.nombre, p_nombre) >= p_umbral)
  order by similitud desc
  limit 5;
$$;

create or replace function buscar_proveedor_similar(
  p_nombre text,
  p_umbral numeric default 0.35
)
returns table (
  id uuid,
  nombre text,
  categoria text,
  similitud numeric
)
language sql
stable
set search_path = public, extensions
as $$
  select pv.id, pv.nombre, pv.categoria,
    similarity(pv.nombre, p_nombre)::numeric as similitud
  from proveedores_maestro pv
  where pv.nombre ilike p_nombre || '%' or similarity(pv.nombre, p_nombre) >= p_umbral
  order by similitud desc
  limit 5;
$$;

comment on function buscar_producto_similar is 'Candidatos de productos_maestro por prefijo (ILIKE, desde la primera letra) o similitud de nombre (pg_trgm), filtrados por misma unidad_base cuando se conoce. Usado por ai-proxy y AprobacionPanel (admin-web) para evitar duplicar el catálogo maestro.';
comment on function buscar_proveedor_similar is 'Candidatos de proveedores_maestro por prefijo (ILIKE) o similitud de nombre (pg_trgm). Mismo propósito que buscar_producto_similar.';
