# Compi — Preguntas frecuentes (limitaciones conocidas, no bugs)

Este documento registra comportamientos que **son intencionales**, aunque a primera vista puedan parecer un error. Se añaden aquí cuando surge la pregunta durante una auditoría o prueba, para no volver a investigarlos como si fueran bugs nuevos.

## ¿Por qué el total de un pedido viejo en el historial no coincide con lo que realmente pagué?

El historial de pedidos (`RelacionDetalleScreen`, detalle de abastecimiento) calcula el subtotal de cada pedido usando el **precio actual** guardado en `productos_relacion.precio_pactado`, no el precio vigente en el momento en que se hizo ese pedido específico.

Esto significa que si le cambiaste el precio a un producto después de haber hecho un pedido, el total mostrado para ese pedido viejo se recalcula con el precio nuevo — puede no coincidir con lo que de verdad pagaste ese día.

**Decisión de producto (18 jul 2026):** esto no se corrige. Guardar un snapshot histórico del precio por cada `pedido_item` es una funcionalidad más grande (implica cambios de esquema y de cómo se muestran todos los totales históricos) que no está priorizada para el MVP. Se documenta como limitación conocida.
