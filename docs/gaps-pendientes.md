# Compi — Gaps detectados en revisión de arquitectura (14 jul 2026)

Este documento registra huecos de lógica, arquitectura y pantallas encontrados al revisar el estado real del código contra los documentos maestros (`producto.md`, `arquitectura.md`, `pantallas.md`). Se van tachando/moviendo a "Resuelto" a medida que se cierran — no se borran, para dejar trazabilidad de qué se decidió y por qué.

## Prioridad 1 — Bloquean el flujo básico o son riesgo de seguridad

> **Gap #1 reclasificado a Prioridad 2 (15 jul 2026).** La premisa original ("no existe forma de fijar el precio") era incorrecta: el precio ya se puede fijar en 3 pantallas, así que no bloquea el flujo básico. Ver #1 en Prioridad 2.

> **Gap #2 resuelto en su mayoría (16 jul 2026).** Fases 1-3 (Phone Auth real
> para tenderos, tabla `admins` + `comercio_miembros`, RLS activa en todas las
> tablas) ya están en producción — ver sección **Resuelto** más abajo para el
> detalle. Lo único que queda de este gap es la **Fase 4** (app web de admin
> separada, `apps/admin-web/`), que es exactamente el mismo trabajo que el gap
> **#4** de abajo (pantallas de curaduría) — no se duplica como ítem propio,
> queda fusionado ahí. Gap #4 pasa a ser, con esto, el único bloqueante real de
> Prioridad 1 pendiente.

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

### 4. Cola de curaduría del admin sin pantallas (Fase 4 — apps/admin-web/)
`producto.md` documenta 4 tareas de curaduría (aprobar proveedores nuevos, fusionar duplicados, revisar promociones, validar productos nuevos) pero no existe ninguna pantalla diseñada para esto — ni en `pantallas.md` ni en código. Es la Fase 4 del gap #2 (ver nota de resolución arriba) — misma pieza de trabajo, un solo ítem.

> ⚠️ **BLOQUEANTE PARA PRODUCCIÓN — EL CUELLO DE BOTELLA ACTUAL (actualizado
> 16 jul 2026).** Con gap #2 Fase 3 (RLS + colas `proveedores_sugeridos`/
> `productos_sugeridos`), el tendero ya no crea proveedores/productos nuevos
> directo — quedan pendientes de aprobación. Por ahora el único usuario
> probando es el dueño del proyecto, que aprueba manual por SQL Editor
> (puente aceptado mientras no exista panel admin). **Antes de dar acceso a
> cualquier tendero real que no sea el dueño**, hace falta construir al menos
> las **2 pantallas mínimas de aprobación** (proveedores nuevos, productos
> nuevos) en `apps/admin-web/` (Vite + React + supabase-js) — sin esto,
> cualquier tendero real que agregue un proveedor/producto genuinamente nuevo
> queda bloqueado indefinidamente sin que nadie más pueda aprobarlo. No es
> solo mejora de UX, es requisito de lanzamiento. **Priorizado como el
> siguiente bloque de trabajo (16 jul 2026)** — casi todo lo demás pendiente
> en este documento depende, directa o indirectamente, de que esto exista.

### 5. Sin decisión de infraestructura de notificaciones push
La pantalla de Notificaciones y el diseño de "notificaciones agrupadas por comercio" del Motor de Reabastecimiento Predictivo asumen push funcionando, pero no hay decisión de qué servicio usar (candidato natural: Expo Push Notifications, ya que el proyecto es Expo) ni manejo de permisos/tokens.

> **Gap #6 resuelto (16 jul 2026).** Ver sección Resuelto — el flujo completo ya existe.

### 9. Motor de cobertura de proveedores — piezas sin conectar (16 jul 2026)
El motor en sí (migraciones `0009`/`0010`: `v_cobertura_proveedor`, `v_patron_dia_proveedor`, RPC `cobertura_confianza`) ya está en producción y conectado en `AgregarProveedorScreen`. Quedan sueltas:
- **Campo manual `zonas_cobertura`** (declarado a mano por un admin, señal secundaria) — depende de que exista la Fase 4 (gap #4), es su lugar natural de captura.
- **`cobertura_senales_negativas`** — la tabla y las políticas RLS existen (guarda el motivo "no cubre mi zona" al eliminar un proveedor sin historial), pero **no está conectada a ninguna pantalla todavía** — falta el chip en el diálogo de "Eliminar proveedor".
- **Backfill de `lat`/`lng`** para comercios registrados antes de este cambio — hoy solo comercios nuevos capturan GPS automáticamente al registrarse.
- **Sugerencia proactiva en onboarding**: la RPC ya devuelve proveedores con cobertura confirmada, pero no está conectada a ninguna pantalla del flujo de registro/onboarding todavía.
- **Normalización de `comercios.barrio`** (texto libre, sin lista controlada) — sigue siendo frágil para cualquier matching por nombre de barrio, incluido el patrón de día de entrega. Afecta también al gap ya resuelto de recomendación por barrio.

## Prioridad 3 — Menores, revisar cuando haya tiempo

### 7. Estados de error incompletos
Solo están documentados/construidos: permisos de contactos denegados, sin conexión. Faltan: proveedor que nunca confirma tras reintentos (el documento dice "se devuelve la decisión al tendero" pero no hay pantalla), teléfono ya registrado por otro comercio al crear cuenta nueva.

### 8. IDC no visible para el tendero
Hoy es una métrica puramente interna/de negocio. Vale la pena decidir explícitamente si se muestra al tendero (ej. "llevas 6 de 10 proveedores en Compi") como incentivo de adopción, o se mantiene interna a propósito.

## Resuelto

### Separación de roles admin/tendero (antes gap #2, Fases 1-3) — 16 jul 2026
El panel de admin ya no comparte login sin control con el tendero: Fase 1 agregó la tabla `admins` + `comercio_miembros` con helpers `is_admin()`/`es_miembro()` (`SECURITY DEFINER`); Fase 2 puso Phone Auth real (OTP por SMS) para tenderos en vez del código demo `1234`; Fase 3 activó RLS en las 11 tablas existentes, con políticas basadas en esos helpers. El acceso a datos de otro comercio o a funciones de curaduría ya no depende de ocultar un botón en la UI — está forzado a nivel de Postgres. Lo único que sigue pendiente es la **Fase 4** (app web de admin separada, para sacar del todo el panel de la app del tendero) — ver gap #4, que absorbe ese trabajo.

### `sugerencias_cambio_proveedor` (antes gap #6) — 16 jul 2026
Ya existe el flujo completo: el tendero propone un cambio de teléfono de un proveedor desde `ProveedoresTabScreen` ("avísale a Compi para actualizarlo"), y el admin lo aprueba o rechaza desde `SugerenciasCambioScreen` (accesible desde Perfil → herramientas de administración). Aprobar actualiza el teléfono en `proveedores_maestro` para todas las tiendas que usan ese proveedor.

## Pendientes ya registrados de conversaciones anteriores (no son de esta revisión, se listan para no perderlos)

- **Términos de uso / política de privacidad**: pendiente diseñar antes de lanzar a tenderos reales — `ImportarContactosScreen` envía contactos reales (nombres de terceros) a la API de Anthropic vía `ai-proxy` para clasificación.
- **`pedidos.estado`** en datos sembrados: ya resuelto (sincronizado a `entregado` para Minimercado La 80).
- **`docs/catalogo-matching-unidades.md`** (curaduría-por-coincidencia + estandarización de unidades): diseño completo y aprobado, implementación pausada explícitamente hasta después de gap #2 Fase 3. Fase 3 ya está en producción — **retomable ahora**, si se quiere priorizar sobre Fase 4 o en paralelo.