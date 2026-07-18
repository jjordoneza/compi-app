-- Restaura las versiones de 0025 (solo similarity(), sin el OR de ILIKE prefijo).
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
