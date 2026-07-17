-- Dato crudo de términos comerciales de la relación: si el proveedor le fía
-- al tendero. minimo_pedido ya existe desde antes (RelacionDetalleScreen.js)
-- así que esta migración solo agrega la pieza que faltaba. No construye
-- ningún sistema de cartera/crédito — solo el campo.
alter table relaciones add column if not exists acepta_credito boolean not null default false;

comment on column relaciones.acepta_credito is 'Si el proveedor le fía al tendero en esta relación. Dato crudo capturado por el tendero, sin lógica de cartera todavía.';
