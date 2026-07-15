-- Rollback de 0003_auth_roles_foundation.sql (Fase 1).
-- Revierte solo lo que crea la Fase 1. Como la Fase 1 NO activa RLS en las tablas
-- existentes, este rollback no afecta a la app actual.
-- (El rollback de la migración PELIGROSA — activar RLS en las tablas existentes —
-- viene con la Fase 3, no aquí.)

drop function if exists reclamar_comercios_por_telefono();
drop function if exists crear_comercio(text, text, text, integer);

drop table if exists productos_sugeridos;
drop table if exists proveedores_sugeridos;
drop table if exists comercio_miembros;
drop table if exists admins;

-- Helpers al final: los dropea después de las tablas que los usan en políticas.
drop function if exists es_miembro(uuid);
drop function if exists is_admin();
