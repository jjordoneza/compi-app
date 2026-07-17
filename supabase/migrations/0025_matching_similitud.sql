-- Retoma docs/catalogo-matching-unidades.md §2 (diseño aprobado, nunca
-- implementado): búsqueda de coincidencias por similitud de texto, para que
-- la cola de curaduría se use solo cuando un producto/proveedor genuinamente
-- no existe, no cuando ya existe con variación de nombre/tamaño.
--
-- pg_trgm instala similarity()/% en el esquema `extensions`, igual que
-- cube/earthdistance en 0010 — mismo search_path de 2 esquemas.
create extension if not exists pg_trgm;

create index if not exists idx_productos_maestro_nombre_trgm
  on productos_maestro using gin (nombre extensions.gin_trgm_ops);
create index if not exists idx_proveedores_maestro_nombre_trgm
  on proveedores_maestro using gin (nombre extensions.gin_trgm_ops);

-- buscar_producto_similar — candidatos de productos_maestro con misma
-- unidad_base (si se conoce) y similitud de nombre por encima del umbral.
-- Sin security definer: productos_maestro ya es de lectura pública (0007,
-- provmaestro_select/prodmaestro_select using (true)), así que la anon key
-- de ai-proxy puede llamarla directo.
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
    and similarity(pm.nombre, p_nombre) >= p_umbral
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
  where similarity(pv.nombre, p_nombre) >= p_umbral
  order by similitud desc
  limit 5;
$$;

comment on function buscar_producto_similar is 'Candidatos de productos_maestro por similitud de nombre (pg_trgm), filtrados por misma unidad_base cuando se conoce. Usado por ai-proxy y AprobacionPanel (admin-web) para evitar duplicar el catálogo maestro.';
comment on function buscar_proveedor_similar is 'Candidatos de proveedores_maestro por similitud de nombre (pg_trgm). Mismo propósito que buscar_producto_similar.';
