-- Rollback de 0011: quita las 4 RPCs de aprobación/rechazo y las columnas
-- motivo_rechazo. No toca proveedores_sugeridos/productos_sugeridos más allá
-- de esa columna — las filas ya aprobadas/rechazadas quedan como están.

drop function if exists aprobar_proveedor_sugerido(uuid, uuid);
drop function if exists rechazar_proveedor_sugerido(uuid, text);
drop function if exists aprobar_producto_sugerido(uuid, uuid);
drop function if exists rechazar_producto_sugerido(uuid, text);

alter table proveedores_sugeridos drop column if exists motivo_rechazo;
alter table productos_sugeridos drop column if exists motivo_rechazo;
