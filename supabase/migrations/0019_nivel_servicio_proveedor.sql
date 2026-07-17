-- docs/producto.md y docs/arquitectura.md ya definen 3 niveles de servicio de
-- proveedor (Personal-WhatsApp, Compi-panel, Enterprise-API) pero hoy no hay
-- ningún campo que lo registre — el canal real (WhatsApp/panel/API) todavía
-- no existe, así que por ahora es solo metadato para cuando se construya, sin
-- inferirlo del historial más adelante.
alter table proveedores_maestro add column if not exists nivel_servicio text
  not null default 'personal'
  check (nivel_servicio in ('personal', 'compi', 'enterprise'));

comment on column proveedores_maestro.nivel_servicio is 'Canal por el que Compi opera con este proveedor: personal (WhatsApp, MVP), compi (panel web, Fase 3) o enterprise (API/ERP). Default personal — hoy todos los proveedores son de este nivel porque los otros 2 canales no existen todavía.';
