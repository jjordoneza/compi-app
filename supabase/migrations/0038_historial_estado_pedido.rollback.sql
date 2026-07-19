drop function if exists avanzar_estado_pedido(uuid);
drop table if exists pedido_estado_historial;

-- pedidos.created_at NO se revierte a propósito: la migración usó "add
-- column if not exists", así que no sabemos si ya existía antes de correrla
-- (es una tabla anterior al sistema de migraciones) — dropearla en el
-- rollback podría destruir una columna que no creamos nosotros.
