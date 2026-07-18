drop function if exists intentar_auto_vincular_proveedor(uuid, text, text, text, text, numeric);
alter table proveedores_sugeridos drop column if exists telefono;
