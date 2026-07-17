-- 3 piezas de bajo riesgo, todas aditivas a comercios, agrupadas en una sola
-- migración (mismo criterio que 0012 con ciudad/contacto_nombre):
--
-- 1) categoria: tipo de negocio, vocabulario controlado (evita el mismo
--    problema de normalización que ya tiene barrio en texto libre).
-- 2) canal_adquisicion: cómo llegó el tendero a Compi — barato de capturar
--    ahora, muy caro de reconstruir después cuando se invierta en adquisición.
-- 3) terminos_aceptados_en / terminos_version: para cuando existan términos de
--    uso/privacidad publicados (ver docs/gaps-pendientes.md). Sin pantalla de
--    aceptación todavía — solo el esquema, listo para cuando se redacten.
alter table comercios add column if not exists categoria text
  check (categoria in ('tienda_barrio', 'panaderia', 'licorera', 'minimarket', 'otro'));
alter table comercios add column if not exists canal_adquisicion text
  check (canal_adquisicion in ('referido', 'redes_sociales', 'visita_directa', 'otro'));
alter table comercios add column if not exists terminos_aceptados_en timestamptz;
alter table comercios add column if not exists terminos_version text;

comment on column comercios.categoria is 'Tipo de negocio (tienda_barrio, panaderia, licorera, minimarket, otro). Opcional, capturado en el registro.';
comment on column comercios.canal_adquisicion is 'Cómo llegó el tendero a Compi (referido, redes_sociales, visita_directa, otro). Opcional, capturado en el registro.';
comment on column comercios.terminos_aceptados_en is 'Fecha/hora en que el tendero aceptó los términos de uso vigentes. Null hasta que exista la pantalla de aceptación.';
comment on column comercios.terminos_version is 'Versión de los términos de uso aceptada (ej. "2026-01"). Null hasta que exista la pantalla de aceptación.';
