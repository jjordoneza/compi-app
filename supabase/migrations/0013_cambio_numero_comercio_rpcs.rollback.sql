-- Rollback de 0013: quita las 4 RPCs de cambio de número, la tabla
-- sugerencias_cambio_comercio (+ sus políticas), y motivo_rechazo de
-- sugerencias_cambio_proveedor. No revierte SugerenciasCambioScreen.js a su
-- patrón de PATCH directo — eso es cambio de cliente, no de esquema.

drop function if exists aprobar_cambio_numero_proveedor(uuid);
drop function if exists rechazar_cambio_numero_proveedor(uuid, text);
drop function if exists aprobar_cambio_comercio(uuid);
drop function if exists rechazar_cambio_comercio(uuid, text);

drop policy if exists sugcambiocom_select on sugerencias_cambio_comercio;
drop policy if exists sugcambiocom_insert on sugerencias_cambio_comercio;
drop policy if exists sugcambiocom_update_admin on sugerencias_cambio_comercio;
drop table if exists sugerencias_cambio_comercio;

alter table sugerencias_cambio_proveedor drop column if exists motivo_rechazo;
