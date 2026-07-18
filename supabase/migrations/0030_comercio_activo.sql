-- "Eliminar perfil" en Mi negocio (tendero): siempre soft-delete, nunca borra
-- en cascada relaciones/abastecimientos/pedidos de esa tienda. Un tendero
-- puede tener 2+ comercios (SeleccionarNegocioScreen) — desactivar uno no
-- debe tocar los demás ni su historial.
alter table comercios add column if not exists activo boolean not null default true;

comment on column comercios.activo is 'Soft-delete de "Eliminar perfil" (18 jul 2026). false = el tendero ya no ve este comercio en su lista, pero su historial (relaciones, abastecimientos, pedidos) queda intacto. No hay UI de reactivación — es intencional, mismo patrón que relaciones.activo.';
