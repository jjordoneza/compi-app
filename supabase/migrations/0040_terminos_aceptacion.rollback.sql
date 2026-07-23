-- Rollback de 0040_terminos_aceptacion.sql

drop function if exists aceptar_terminos();
drop function if exists terminos_pendientes();
drop table if exists terminos_aceptaciones;
drop table if exists documentos_legales;
