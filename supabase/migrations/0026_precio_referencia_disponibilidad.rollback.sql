drop function if exists precio_referencia(uuid, uuid, uuid);
drop trigger if exists trg_productos_relacion_precio_actualizado on productos_relacion;
drop function if exists fn_productos_relacion_precio_actualizado();
alter table productos_relacion drop column if exists precio_actualizado_en;
alter table productos_relacion drop column if exists disponible;
