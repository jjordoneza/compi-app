-- Rollback de 0028: quita crear_abastecimiento. ConfirmarPedidoScreen.js vuelve
-- a necesitar el loop secuencial de inserts sueltos si se revierte esto — no
-- lo hagas sin revertir también el cliente.

drop function if exists crear_abastecimiento(uuid, jsonb);
