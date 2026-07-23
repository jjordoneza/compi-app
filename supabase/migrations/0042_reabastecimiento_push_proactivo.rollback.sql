-- Rollback de 0042_reabastecimiento_push_proactivo.sql

select cron.unschedule('notificar_reabastecimientos_pendientes');

drop function if exists notificar_reabastecimientos_pendientes();

alter table reabastecimiento_sugerencias drop column if exists notificado_en;
