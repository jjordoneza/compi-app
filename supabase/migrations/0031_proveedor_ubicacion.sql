-- Ubicación del proveedor (barrio/ciudad/dirección) — dato global e
-- "inamovible" que solo el admin recolecta/valida al crear o editar el
-- proveedor en Maestro de proveedores (admin-web). El tendero SOLO la ve
-- (RelacionDetalleScreen, AgregarProveedorScreen) — nunca la edita ni la
-- propone, a diferencia del resto de la cola de curaduría. Decisión de
-- producto confirmada 18 jul 2026.
alter table proveedores_maestro add column if not exists barrio text;
alter table proveedores_maestro add column if not exists ciudad text;
alter table proveedores_maestro add column if not exists direccion text;

comment on column proveedores_maestro.barrio is 'Ubicación del proveedor, solo-admin (Maestro de proveedores). El tendero la ve de solo lectura.';
comment on column proveedores_maestro.ciudad is 'Ubicación del proveedor, solo-admin. Usada además para filtrar "Otros proveedores" en AgregarProveedorScreen a Medellín + área metropolitana.';
comment on column proveedores_maestro.direccion is 'Ubicación del proveedor, solo-admin (Maestro de proveedores). El tendero la ve de solo lectura.';
