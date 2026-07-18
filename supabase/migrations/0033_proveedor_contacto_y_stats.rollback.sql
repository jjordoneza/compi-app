drop function if exists admin_stats_por_proveedor();
alter table proveedores_maestro drop column if exists contacto_nombre;
alter table proveedores_maestro drop column if exists telefono_secundario;
