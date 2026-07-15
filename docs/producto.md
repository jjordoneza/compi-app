# Compi — Reglas de producto

Compi es una app de abastecimiento para tenderos de tiendas de barrio en Colombia. El tendero usa Compi para resurtir su negocio desde múltiples proveedores con la mínima fricción posible.

## Principio central
Compi hace pocas cosas, pero las hace mejor que cualquier otra plataforma. Evitar activamente convertirlo en un CRM, un sistema de inventario o una "app para administrar todo el negocio". Ante cualquier feature nueva, la pregunta es si de verdad ayuda a resurtir más rápido — no si "seria útil tenerla".

## Modelo de datos — la decisión más importante
**El producto es global, el precio es de la relación.**

- **Proveedor Maestro**: global y único. Si "Distribuidora El Sol" ya existe en Compi (la agregó otra tienda), una tienda nueva se vincula al mismo registro en vez de crear uno nuevo (esto es el "Marketplace Invisible").
- **Relación**: el vínculo específico entre una tienda y un proveedor. Aquí viven días de pedido, mínimos, y sobre todo los precios pactados.
- **Producto Maestro vs Producto en Relación**: el SKU es global ("Gaseosa 1.5L" existe una sola vez), pero el precio es la instancia de la relación. Un mismo producto maestro puede tener tantos precios como relaciones lo incluyan.
- **Abastecimiento vs Pedido**: el Abastecimiento es el acto completo de resurtir (objeto de primera clase, es lo que el usuario manipula). El Pedido es cada trozo que va a un proveedor específico — un abastecimiento se divide en varios pedidos.
- **proveedores_totales**: campo en Comercio donde el tendero declara a cuántos proveedores le compra en total (aunque no todos pasen por Compi). Es el denominador del IDC (Índice de Digitalización del Canal), la North Star del producto.

## Reglas de negocio no negociables

1. **Los proveedores no son modificados directamente por tenderos.** Cualquier cambio (nuevo producto que no existe en el catálogo maestro, corrección de datos de un proveedor, fusión de duplicados) pasa por una cola de curaduría en el panel admin — nunca se crea/modifica automático desde la app del tendero.
2. **Estados de pedido — una sola fuente de verdad.** El tendero ve solo 3 estados: `Procesando`, `Confirmado`, `Entregado`. Internamente el sistema puede manejar más granularidad (pendiente, enviado, recibido, confirmado, despachado, entregado) pero esa complejidad nunca se expone en la UI del tendero.
3. **"Repetir pedido" es el héroe del MVP, no "pedido sugerido con IA".** Repetir funciona desde el pedido #2 (sin necesitar historial largo) y cubre 70-80% de las compras reales. El pedido sugerido con inteligencia y el Motor de Reabastecimiento Predictivo son Fase 3 — dependen de tener historial real, para no inventar una sugerencia que dañe la confianza el día 1.
4. **Motor de Reabastecimiento Predictivo (Fase 3, no MVP):**
   - Requiere mínimo **3 compras históricas** de un producto antes de generar cualquier sugerencia.
   - Usa un multiplicador de **1.3x** sobre la cadencia promedio de compra para estimar cuándo sugerir reposición.
   - Surfacea **una sugerencia a la vez** (nunca una lista de varias sugerencias simultáneas).
   - Notificaciones se agrupan **por comercio**, nunca por producto individual, para evitar spam.
   - El modelo se recalibra con la respuesta del tendero: si dice "ya lo compré" (por otro canal), se ajusta la fecha base del ciclo; si dice "todavía tengo", se extiende la ventana estimada antes de la próxima sugerencia.
5. **El proveedor no tiene app propia en el MVP.** Recibe WhatsApp (nivel Personal) o usa un panel web (nivel Compi, llega en Fase 3) o API/ERP (nivel Enterprise). El tendero nunca nota ni le importa cuál canal usa un proveedor específico — la experiencia se ve igual desde su lado.
6. **Onboarding — el paso más determinante para el éxito del MVP,** más que cualquier pantalla individual. Se resuelve sin operador humano, con tres fuentes combinadas:
   - Importar contactos del teléfono (marcar cuáles son proveedores con un tap).
   - Pegar un pedido viejo de WhatsApp que un LLM convierte en catálogo estructurado.
   - Plantillas de catálogo semilla por tipo de negocio (arranque en frío).
   - Importante: el onboarding debe cubrir **más de un proveedor** con un loop breve y abandonable ("¿Hacemos lo mismo con el siguiente proveedor?", con "Terminar por ahora" siempre disponible) — no basta con catalogar solo el primero y asumir que el tendero termina.
7. **Enrutamiento de pedidos sin call center.** Proveedores digitales confirman con un tap (API/panel). Proveedores de WhatsApp reciben un mensaje con botones (Confirmar / Con cambios / No puedo); si responden en texto libre, un LLM interpreta la respuesta y actualiza el pedido, notificando al tendero para aprobar/rechazar el cambio. Si un proveedor no responde tras reintentos automáticos, el control vuelve al tendero (quien conoce al proveedor), no a un operador de Compi.
8. **El panel de admin es curaduría, no operación.** Solo 4 tareas requieren criterio humano: aprobar proveedores nuevos, fusionar duplicados, revisar calidad de promociones, y validar productos nuevos sugeridos por un tendero antes de que entren al Catálogo Maestro. Todo lo demás es lectura de métricas. Regla de oro: si una tarea repetitiva aparece más de 20 veces, es candidata a automatizarse, no a asignarse a una persona.

## Patrones de UX transversales (aplican a toda pantalla nueva)
- Un solo héroe por pantalla — nunca más de una acción principal dominante compitiendo.
- Bottom nav de 3 tabs: Inicio / Pedidos / Proveedores. El perfil vive en el header, no en el bottom nav.
- Áreas táctiles mínimas de 48px, incluidos los botones +/- de cantidad.
- Máximo 3 datos visibles por producto en listas (ej. nombre, presentación/proveedor, precio o cantidad — no más).
- Precios visibles por producto y como total estimado antes de confirmar cualquier pedido.
- Estados de error y vacíos redactados como acompañamiento ("tranquilo, nosotros lo resolvemos"), nunca como error técnico frío.
- El Home nunca inventa una sugerencia sin historial real — cuando no hay datos, ofrece honestamente "empezar", no una sugerencia fabricada.

## Modelo de monetización (contexto, no afecta código del MVP)
El tendero nunca paga. Los proveedores pagarían por visibilidad, promociones y herramientas (sin comisión desde el lanzamiento). Esta decisión se valida con evidencia real más adelante (ej. con 500 tiendas activas), no es algo a implementar ahora.
