# Compi — Gaps detectados en revisión de arquitectura (14 jul 2026, actualizado 17 jul 2026)

Este documento registra huecos de lógica, arquitectura y pantallas encontrados al revisar el estado real del código contra los documentos maestros (`producto.md`, `arquitectura.md`, `pantallas.md`). Se van tachando/moviendo a "Resuelto" a medida que se cierran — no se borran, para dejar trazabilidad de qué se decidió y por qué.

## Prioridad 1 — Bloquean el flujo básico o son riesgo de seguridad

> **Gap #1 reclasificado a Prioridad 2 (15 jul 2026).** La premisa original ("no existe forma de fijar el precio") era incorrecta: el precio ya se puede fijar en 3 pantallas, así que no bloquea el flujo básico. Ver #1 en Prioridad 2.

> **Gap #2 resuelto por completo (17 jul 2026).** Fases 1-3 (Phone Auth real
> para tenderos, tabla `admins` + `comercio_miembros`, RLS activa en todas las
> tablas) ya estaban en producción desde el 16 jul. La **Fase 4** (app web de
> admin separada, `apps/admin-web/`) también se construyó y se mergeó
> (`ebb1941` y siguientes) — ver gap #4 (ahora en **Resuelto**) para el
> detalle. Con esto no queda ningún ítem abierto de Prioridad 1.

> **Gap #3 resuelto (17 jul 2026).** Ver sección **Resuelto** — `apps/admin-web/` (`PedidosOperacion.jsx`) ya tiene el mecanismo manual de avance de estado.

**No quedan bloqueantes de Prioridad 1 abiertos** al 17 jul 2026.

## Prioridad 2 — Riesgos estructurales, no bloquean uso inmediato

### 1. Fricción: productos de "Pegar pedido" nacen sin precio (reclasificado de P1 → P2, 15 jul 2026)
**Corrección de la premisa original** ("no existe pantalla para fijar el precio"): el tendero **sí puede** fijar `precio_pactado` directamente, sin cola de curaduría admin, en 3 lugares — el precio es dato privado de la relación tienda-proveedor y se escribe directo vía `ProductosRelacionExt.actualizar`:
- **Detalle de proveedor** (`RelacionDetalleScreen`): "Poner precio" / "editar" por producto, y agregar un producto con precio.
- **Nuevo abastecimiento** (`NuevoAbastecimientoScreen`): "Sin precio configurado · tócalo para ponerlo", guarda el precio inline mientras se arma el pedido.
- **Confirmar pedido** (`ConfirmarPedidoScreen`): no bloquea confirmar; muestra "sin precio" por ítem, "Precio incompleto" por proveedor y total "Incompleto".

Por eso **no bloquea el flujo básico** (baja de P1 a P2). El residual es de **fricción**: los productos creados desde "Pegar pedido" / "Catálogo detectado" (`PegarPedidoScreen`) y el loop de onboarding nacen con `precio_pactado = null` y ese flujo **no invita a ponerles precio ahí mismo** — quedan sin precio hasta que el tendero los tope por otra pantalla.

**Decidido:** el precio se fija directo por el tendero, sin curaduría (ratifica el diseño ya implementado). La curaduría admin queda reservada solo para la **existencia** del producto/proveedor en el catálogo maestro compartido.

**Pendiente (implementación):** campo de precio opcional por producto en "Catálogo detectado" (Pegar Pedido) + opcionalmente un empujón tocable "faltan N precios · ponlos ahora" en Confirmar pedido. Sin pantalla nueva ni cambios en el modelo de datos.

### 5. Sin decisión de infraestructura de notificaciones push
La pantalla de Notificaciones y el diseño de "notificaciones agrupadas por comercio" del Motor de Reabastecimiento Predictivo asumen push funcionando, pero no hay decisión de qué servicio usar (candidato natural: Expo Push Notifications, ya que el proyecto es Expo) ni manejo de permisos/tokens.

> **Gap #6 resuelto (16 jul 2026).** Ver sección Resuelto — el flujo completo ya existe.

### 9. Motor de cobertura de proveedores — piezas sin conectar (16 jul 2026, revisado 17 jul 2026)
El motor en sí (migraciones `0009`/`0010`: `v_cobertura_proveedor`, `v_patron_dia_proveedor`, RPC `cobertura_confianza`) ya está en producción y conectado en `AgregarProveedorScreen`. Quedan sueltas:
- **Campo manual `zonas_cobertura`** (declarado a mano por un admin, señal secundaria) — ya no depende de nada: la Fase 4 (`apps/admin-web/`, ver Resuelto) existe, así que su lugar natural de captura ya está disponible. Sigue pendiente construir el campo en sí (ej. en Maestro de proveedores).
- **`cobertura_senales_negativas`** — la tabla y las políticas RLS existen (guarda el motivo "no cubre mi zona" al eliminar un proveedor sin historial), pero **sigue sin estar conectada a ninguna pantalla** — falta el chip en el diálogo de "Eliminar proveedor" (RN) y no hay UI de tendero que la escriba (confirmado de nuevo en la auditoría del 17 jul, `checklistauditoria.md` sección D/H).
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
El panel de admin ya no comparte login sin control con el tendero: Fase 1 agregó la tabla `admins` + `comercio_miembros` con helpers `is_admin()`/`es_miembro()` (`SECURITY DEFINER`); Fase 2 puso Phone Auth real (OTP por SMS) para tenderos en vez del código demo `1234`; Fase 3 activó RLS en las 11 tablas existentes, con políticas basadas en esos helpers. El acceso a datos de otro comercio o a funciones de curaduría ya no depende de ocultar un botón en la UI — está forzado a nivel de Postgres.

### Fase 4 — panel `apps/admin-web/` completo, incluida la cola de curaduría (antes gap #4) — 17 jul 2026
Se construyó y mergeó la app web de admin separada (Vite + React + `supabase-js`, login propio por email/password + chequeo `is_admin()`), con **11 pantallas**: Dashboard, Adopción y retención, Salud de la red, Proveedores nuevos, Productos nuevos (las 2 pantallas de curaduría que este gap pedía — con `AprobacionPanel` compartido, búsqueda de candidato existente por similitud pg_trgm, y botón "Aprobar — vincular a {nombre}" / "Aprobar — crear nuevo"), Cambios pendientes, Maestro negocios, Maestro de proveedores, Maestro de productos, y Pedidos (Operación). Con esto deja de haber un cuello de botella: cualquier admin con fila en `admins` puede aprobar proveedores/productos nuevos sin tocar el SQL Editor. Detalle exhaustivo de cada pantalla en `docs/checklistauditoria.md` sección B.

### Mecanismo manual de confirmación de pedidos (antes gap P1 #3) — 17 jul 2026
Llegó como parte del mismo trabajo de Fase 4: la pantalla **Pedidos (Operación)** en `apps/admin-web/` (`PedidosOperacion.jsx`) tiene un botón "Marcar como {siguiente estado}" por pedido, que avanza `pendiente → confirmado → entregado` y recalcula el estado general del abastecimiento (todos entregado → entregado; mezcla confirmado/entregado sin pendientes → confirmado; cualquier otra combinación → procesando). Cubre la necesidad mientras el agente de WhatsApp para proveedores sigue bloqueado por el trámite de Meta. **Nota de seguridad pendiente** (ver nueva sección de bugs abajo): el PATCH de estado no pasa por ninguna RPC, así que nada a nivel de Postgres impide un estado fuera de secuencia si se llama la API directo.

### `sugerencias_cambio_proveedor` (antes gap #6) — 16 jul 2026
Ya existe el flujo completo: el tendero propone un cambio de teléfono de un proveedor desde `ProveedoresTabScreen` ("avísale a Compi para actualizarlo"), y el admin lo aprueba o rechaza desde `SugerenciasCambioScreen` (accesible desde Perfil → herramientas de administración). Aprobar actualiza el teléfono en `proveedores_maestro` para todas las tiendas que usan ese proveedor.

## Bugs de código de la auditoría exhaustiva (`checklistauditoria.md`) — 7 resueltos, 17 jul 2026

Los 7 hallazgos de la sección F de `checklistauditoria.md` se confirmaron todos presentes en el código (no solo teoría) y se corrigieron en esta ronda:

1. **✅ resuelto — `ProveedoresNuevos.jsx` / `ProductosNuevos.jsx`**: el render evaluaba `items === null` antes que `error`, así que un fallo de carga se quedaba en "Cargando..." para siempre. Se invirtió el orden (`error` primero) y se agregó botón "Reintentar".
2. **✅ resuelto — Maestro de proveedores / Maestro de productos**: "Cancelar" en modo edición no revertía los campos al valor original guardado. Ahora `cancelar()` restaura cada campo desde `item` antes de salir de edición, igual que Maestro negocios.
3. **✅ resuelto — Onboarding de proveedores (`OnboardingProveedoresScreen`)**: `cargar()` no tenía try/catch; un fallo de red dejaba el spinner infinito. Ahora captura el error y muestra pantalla dedicada con "Reintentar" / "Ir al inicio".
4. **✅ resuelto — Splash (`SplashScreen`)**: se agregó timeout de 8s (`TIMEOUT_RESTAURAR_MS`) — si `cargarSesion()`/`MisComercios.listar()` nunca resuelve, se deja de esperar y se muestra "Empezar" en vez de colgarse.
5. **✅ resuelto — Envío de abastecimiento (`ConfirmarPedidoScreen`)**: sin RPC/transacción de por medio, se agregó tracking en memoria (`abastecimientoIdRef` + `enviadosRef`) para que un reintento tras fallo parcial reutilice el abastecimiento ya creado y salte los proveedores que ya se guardaron, en vez de duplicarlos.
6. **✅ resuelto — "Pegar pedido" / "Importar contactos"**: mismo patrón de tracking en memoria (`procesadosRef` / `guardadosRef`) para que un reintento tras fallo parcial no repita los ítems ya guardados.
7. **✅ resuelto — Mi negocio (tendero)**: `barrio` vacío ahora se guarda como `null`, igual que ciudad/dirección/detalles/contacto (antes se guardaba como `''`).

**Nota de seguridad que queda documentada, no es de esta lista de 7 ni se tocó**: `actualizarEstadoPedido`/`actualizarEstadoAbastecimiento` (admin-web) siguen siendo PATCH directos a la tabla, sin RPC — nada en Postgres impide un estado inválido o fuera de secuencia si se llama la API directo, fuera de esta UI. Vale la pena una RPC dedicada si se prioriza cerrar esa superficie.

## Pendientes ya registrados de conversaciones anteriores (no son de esta revisión, se listan para no perderlos)

- **Términos de uso / política de privacidad**: pendiente diseñar antes de lanzar a tenderos reales — `ImportarContactosScreen` envía contactos reales (nombres de terceros) a la API de Anthropic vía `ai-proxy` para clasificación.
- **`pedidos.estado`** en datos sembrados: ya resuelto (sincronizado a `entregado` para Minimercado La 80).
- **`docs/catalogo-matching-unidades.md`** (curaduría-por-coincidencia + estandarización de unidades): diseño completo y aprobado, implementación pausada explícitamente hasta después de gap #2 Fase 3. Fase 3 ya está en producción — **retomable ahora**, si se quiere priorizar sobre Fase 4 o en paralelo.