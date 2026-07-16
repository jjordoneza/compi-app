-- Rollback de 0008: quita la columna activo de relaciones.
-- OJO: si alguna relación fue desactivada (activo=false) en vez de borrada,
-- este rollback la vuelve a mostrar como si estuviera activa/vinculada — es la
-- naturaleza de borrar la columna, no hay forma de preservar ese estado sin ella.
alter table relaciones drop column if exists activo;
