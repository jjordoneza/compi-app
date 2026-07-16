-- Rollback de 0010: desprograma los refrescos, quita la RPC, las vistas y la
-- tabla de señales negativas, en orden inverso de dependencia. No quita las
-- extensiones (cube, earthdistance, pg_cron) por si algo más las usa —
-- quitar una extensión que otro objeto necesita rompe en seco.

select cron.unschedule('refresh_cobertura_proveedor');
select cron.unschedule('refresh_patron_dia_proveedor');

drop function if exists cobertura_confianza(uuid, numeric, numeric, numeric, numeric);

drop policy if exists cobsenales_insert on cobertura_senales_negativas;
drop policy if exists cobsenales_select_admin on cobertura_senales_negativas;
drop table if exists cobertura_senales_negativas;

drop view if exists v_patron_dia_dominante;
drop materialized view if exists v_patron_dia_proveedor;
drop materialized view if exists v_cobertura_proveedor;
