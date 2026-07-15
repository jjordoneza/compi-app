# Compi — Gaps detectados en revisión de arquitectura (14 jul 2026)

Este documento registra huecos de lógica, arquitectura y pantallas encontrados al revisar el estado real del código contra los documentos maestros (`producto.md`, `arquitectura.md`, `pantallas.md`). Se van tachando/moviendo a "Resuelto" a medida que se cierran — no se borran, para dejar trazabilidad de qué se decidió y por qué.

## Prioridad 1 — Bloquean el flujo básico o son riesgo de seguridad

### 1. No existe pantalla para fijar el precio de un producto nuevo
Cuando un producto se crea desde "Pegar pedido" o "Agrégalo tú mismo", se crea con `productos_relacion.precio_pactado = null` (correcto, va a cola de curaduría). Pero ninguna de las 27 pantallas del MVP permite a un tendero fijar o editar el precio que le paga a un proveedor por un producto en su relación. Sin esto, "Confirmar pedido" no puede mostrar un total real para productos nuevos.

**Pendiente decidir:** ¿el tendero puede fijar su propio precio pactado directamente (por relación, sin pasar por curaduría — ya que el precio es suyo, no del catálogo global), o todo precio nuevo también pasa por aprobación admin? Recomendación: el precio es dato de la relación (privado de esa tienda), no del catálogo compartido — no debería necesitar aprobación admin, solo la existencia del producto/proveedor en el catálogo maestro sí la necesita.

### 2. Separación de roles admin/tendero
El panel de admin vive temporalmente dentro de la pestaña Perfil de la app del tendero, con el mismo login. Esto es un riesgo real: cualquier tendero autenticado podría potencialmente acceder a funciones de curaduría o ver datos de otros comercios si no hay control de permisos explícito a nivel de backend (no solo ocultar el botón en la UI).

**Pendiente decidir:** modelo de roles en Supabase (RLS por rol, tabla de admins separada), y si el panel de admin se separa a una app/dominio web distinto ahora o se pospone con RLS estricto mientras tanto.

### 3. Flujo manual temporal de confirmación de pedidos
El agente de WhatsApp para proveedores (motor de enrutamiento, botones Confirmar/Con cambios/No puedo) depende del trámite de Meta, que tiene el tiempo de espera más largo del proyecto y aún no ha arrancado. Sin el agente, no existe ningún mecanismo — ni manual ni automático — para que un pedido avance de `pendiente` a `confirmado`/`entregado` en el código actual.

**Pendiente decidir:** un mecanismo manual temporal (ej. el propio tendero marca "confirmado" tras hablar con el proveedor por su cuenta, o una pantalla admin simple para marcarlo) mientras el trámite de WhatsApp Business API se resuelve.

## Prioridad 2 — Riesgos estructurales, no bloquean uso inmediato

### 4. Cola de curaduría del admin sin pantallas
`producto.md` documenta 4 tareas de curaduría (aprobar proveedores nuevos, fusionar duplicados, revisar promociones, validar productos nuevos) pero no existe ninguna pantalla diseñada para esto — ni en `pantallas.md` ni en código.

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