# Compi — Gaps detectados en revisión de arquitectura (14 jul 2026)

Este documento registra huecos de lógica, arquitectura y pantallas encontrados al revisar el estado real del código contra los documentos maestros (`producto.md`, `arquitectura.md`, `pantallas.md`). Se van tachando/moviendo a "Resuelto" a medida que se cierran — no se borran, para dejar trazabilidad de qué se decidió y por qué.

## Prioridad 1 — Bloquean el flujo básico o son riesgo de seguridad

> **Gap #1 reclasificado a Prioridad 2 (15 jul 2026).** La premisa original ("no existe forma de fijar el precio") era incorrecta: el precio ya se puede fijar en 3 pantallas, así que no bloquea el flujo básico. Ver #1 en Prioridad 2.

### 2. Separación de roles admin/tendero
El panel de admin vive temporalmente dentro de la pestaña Perfil de la app del tendero, con el mismo login. Esto es un riesgo real: cualquier tendero autenticado podría potencialmente acceder a funciones de curaduría o ver datos de otros comercios si no hay control de permisos explícito a nivel de backend (no solo ocultar el botón en la UI).

**Pendiente decidir:** modelo de roles en Supabase (RLS por rol, tabla de admins separada), y si el panel de admin se separa a una app/dominio web distinto ahora o se pospone con RLS estricto mientras tanto.

### 3. Flujo manual temporal de confirmación de pedidos
El agente de WhatsApp para proveedores (motor de enrutamiento, botones Confirmar/Con cambios/No puedo) depende del trámite de Meta, que tiene el tiempo de espera más largo del proyecto y aún no ha arrancado. Sin el agente, no existe ningún mecanismo — ni manual ni automático — para que un pedido avance de `pendiente` a `confirmado`/`entregado` en el código actual.

**Pendiente decidir:** un mecanismo manual temporal (ej. el propio tendero marca "confirmado" tras hablar con el proveedor por su cuenta, o una pantalla admin simple para marcarlo) mientras el trámite de WhatsApp Business API se resuelve.

## Prioridad 2 — Riesgos estructurales, no bloquean uso inmediato

### 1. Fricción: productos de "Pegar pedido" nacen sin precio (reclasificado de P1 → P2, 15 jul 2026)
**Corrección de la premisa original** ("no existe pantalla para fijar el precio"): el tendero **sí puede** fijar `precio_pactado` directamente, sin cola de curaduría admin, en 3 lugares — el precio es dato privado de la relación tienda-proveedor y se escribe directo vía `ProductosRelacionExt.actualizar`:
- **Detalle de proveedor** (`RelacionDetalleScreen`): "Poner precio" / "editar" por producto, y agregar un producto con precio.
- **Nuevo abastecimiento** (`NuevoAbastecimientoScreen`): "Sin precio configurado · tócalo para ponerlo", guarda el precio inline mientras se arma el pedido.
- **Confirmar pedido** (`ConfirmarPedidoScreen`): no bloquea confirmar; muestra "sin precio" por ítem, "Precio incompleto" por proveedor y total "Incompleto".

Por eso **no bloquea el flujo básico** (baja de P1 a P2). El residual es de **fricción**: los productos creados desde "Pegar pedido" / "Catálogo detectado" (`PegarPedidoScreen`) y el loop de onboarding nacen con `precio_pactado = null` y ese flujo **no invita a ponerles precio ahí mismo** — quedan sin precio hasta que el tendero los tope por otra pantalla.

**Decidido:** el precio se fija directo por el tendero, sin curaduría (ratifica el diseño ya implementado). La curaduría admin queda reservada solo para la **existencia** del producto/proveedor en el catálogo maestro compartido.

**Pendiente (implementación):** campo de precio opcional por producto en "Catálogo detectado" (Pegar Pedido) + opcionalmente un empujón tocable "faltan N precios · ponlos ahora" en Confirmar pedido. Sin pantalla nueva ni cambios en el modelo de datos.

### 4. Cola de curaduría del admin sin pantallas
`producto.md` documenta 4 tareas de curaduría (aprobar proveedores nuevos, fusionar duplicados, revisar promociones, validar productos nuevos) pero no existe ninguna pantalla diseñada para esto — ni en `pantallas.md` ni en código.

> ⚠️ **BLOQUEANTE PARA PRODUCCIÓN (15 jul 2026).** Con gap #2 Fase 3 (RLS +
> colas `proveedores_sugeridos`/`productos_sugeridos`), el tendero ya no crea
> proveedores/productos nuevos directo — quedan pendientes de aprobación. Por
> ahora el único usuario probando es el dueño del proyecto, que aprueba manual
> por SQL Editor (puente aceptado mientras no exista panel admin). **Antes de
> dar acceso a cualquier tendero real que no sea el dueño**, hace falta
> construir al menos las **2 pantallas mínimas de aprobación** (proveedores
> nuevos, productos nuevos) — sin esto, cualquier tendero real que agregue un
> proveedor/producto genuinamente nuevo queda bloqueado indefinidamente sin que
> nadie más pueda aprobarlo. No es solo mejora de UX, es requisito de
> lanzamiento.

### 5. Sin decisión de infraestructura de notificaciones push
La pantalla de Notificaciones y el diseño de "notificaciones agrupadas por comercio" del Motor de Reabastecimiento Predictivo asumen push funcionando, pero no hay decisión de qué servicio usar (candidato natural: Expo Push Notifications, ya que el proyecto es Expo) ni manejo de permisos/tokens.

### 6. `sugerencias_cambio_proveedor` es una tabla sin flujo definido
Existe en el esquema pero no hay pantalla ni regla documentada de cuándo se genera, quién la ve, ni cómo se aprueba/rechaza.

## Prioridad 3 — Menores, revisar cuando haya tiempo

### 7. Estados de error incompletos
Solo están documentados/construidos: permisos de contactos denegados, sin conexión. Faltan: proveedor que nunca confirma tras reintentos (el documento dice "se devuelve la decisión al tendero" pero no hay pantalla), teléfono ya registrado por otro comercio al crear cuenta nueva.

### 8. IDC no visible para el tendero
Hoy es una métrica puramente interna/de negocio. Vale la pena decidir explícitamente si se muestra al tendero (ej. "llevas 6 de 10 proveedores en Compi") como incentivo de adopción, o se mantiene interna a propósito.

## Pendientes ya registrados de conversaciones anteriores (no son de esta revisión, se listan para no perderlos)

- **Términos de uso / política de privacidad**: pendiente diseñar antes de lanzar a tenderos reales — `ImportarContactosScreen` envía contactos reales (nombres de terceros) a la API de Anthropic vía `ai-proxy` para clasificación.
- **`pedidos.estado`** en datos sembrados: ya resuelto (sincronizado a `entregado` para Minimercado La 80).