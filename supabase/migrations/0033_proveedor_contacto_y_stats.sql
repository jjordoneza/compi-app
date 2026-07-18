-- Sigue la decisión de gaps-pendientes.md (18 jul 2026): contacto_nombre y
-- un segundo teléfono de proveedor dejan de ser dato por-relación (cada
-- tienda veía/editaba su propia copia) y pasan a ser dato global del
-- proveedor, editable SOLO por el admin en Maestro de proveedores — mismo
-- tratamiento que ya recibió `telefono` en el gap de teléfono oficial.
-- direccion_entrega NO se toca: sigue siendo per-relación (dirección de
-- entrega de CADA tienda), no es un dato del proveedor.
alter table proveedores_maestro add column if not exists contacto_nombre text;
alter table proveedores_maestro add column if not exists telefono_secundario text;

comment on column proveedores_maestro.contacto_nombre is 'Nombre del administrador/contacto del proveedor. Editable solo desde Maestro de proveedores (admin-web). El tendero lo ve de solo lectura en RelacionDetalleScreen.';
comment on column proveedores_maestro.telefono_secundario is 'Segundo número de contacto del proveedor (además de `telefono`, el oficial). Mismo tratamiento: solo-admin, tendero de solo lectura.';

-- admin_stats_por_proveedor — # productos distintos que vende y # pedidos
-- históricos en toda la red, por proveedor. Mismo patrón que admin_stats()
-- (migración 0015): agregación server-side en una sola RPC, security
-- definer + is_admin(), para no hacer N llamadas desde MaestroProveedores.jsx.
create or replace function admin_stats_por_proveedor()
returns table (
  proveedor_id uuid,
  n_productos integer,
  n_pedidos integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    pv.id as proveedor_id,
    coalesce(prod.n_productos, 0) as n_productos,
    coalesce(ped.n_pedidos, 0) as n_pedidos
  from proveedores_maestro pv
  left join (
    select r.proveedor_id, count(distinct pr.producto_id) as n_productos
    from productos_relacion pr
    join relaciones r on r.id = pr.relacion_id
    group by r.proveedor_id
  ) prod on prod.proveedor_id = pv.id
  left join (
    select r.proveedor_id, count(p.id) as n_pedidos
    from pedidos p
    join relaciones r on r.id = p.relacion_id
    group by r.proveedor_id
  ) ped on ped.proveedor_id = pv.id;
end;
$$;

comment on function admin_stats_por_proveedor is 'Por cada proveedor_maestro: cantidad de productos distintos que vende (via productos_relacion) y cantidad de pedidos históricos (via pedidos), agregado en toda la red. Usado por MaestroProveedores.jsx.';
