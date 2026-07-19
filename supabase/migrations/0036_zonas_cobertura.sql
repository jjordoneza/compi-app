-- zonas_cobertura — señal secundaria manual del motor de confianza de
-- cobertura (ver supabase/migrations/0010_cobertura_proveedor.sql). El motor
-- ya infiere cobertura automáticamente de relaciones activas + entregas
-- reales (v_cobertura_proveedor); este campo es a propósito INDEPENDIENTE de
-- eso — un admin declara a mano en qué barrios/zonas sabe que un proveedor
-- reparte (ej. por conocerlo directamente), como refuerzo cuando todavía no
-- hay suficiente evidencia real (mínimo 3 comercios) para que el motor infiera
-- nada. No se lee todavía en ninguna RPC/pantalla del tendero — queda
-- capturado en Maestro de proveedores para cuando se decida usarlo como señal
-- adicional en cobertura_confianza.
alter table proveedores_maestro add column if not exists zonas_cobertura text;

comment on column proveedores_maestro.zonas_cobertura is 'Barrios/zonas donde un admin sabe (a mano) que este proveedor reparte — señal secundaria manual, independiente del motor automático de v_cobertura_proveedor/cobertura_confianza. Editable solo desde Maestro de proveedores (admin-web). Texto libre separado por coma, mismo formato que categoria.';
