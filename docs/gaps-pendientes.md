# Compi — Gaps detectados en revisión de arquitectura (14 jul 2026, actualizado 18 jul 2026)

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

## Auditoría manual "Sección A" del usuario + trabajo derivado — 18 jul 2026

Ronda grande de fixes/decisiones a partir de una auditoría manual del usuario (app + panel), en 3 bloques. Migraciones nuevas: `0028` a `0034` — **ninguna se aplicó todavía salvo que se indique lo contrario; hay que correrlas a mano en el SQL Editor de Supabase, en orden**.

**Bloque 1 (bugs/UX sin ambigüedad):** back button en Importar Contactos saltaba a Login (`navigate` en vez de `replace`, con guarda anti-duplicado si se reintenta "Continuar"); botón "Dar permiso" de contactos no reaccionaba tras rechazo previo (detecta `canAskAgain` y manda a Ajustes); coincidencia por similitud en Pegar Pedido nunca disparaba (`ai-proxy` bloqueaba la búsqueda si `unidad_base` venía nulo — se quitó ese bloqueo, `buscar_producto_similar` ya tolera nulo); cantidad no podía bajar de 1 en Pegar Pedido; estado de sugerencia de proveedor invisible en app y panel (pill agregado en ambos); búsqueda de "¿ya existe?" en el panel no filtraba desde la 1ª letra (migración `0028`, agrega ILIKE de prefijo); Maestro negocios con fecha de registro + orden reciente-primero; Kanban de 3 columnas en Pedidos (Operación); stepper de proveedores editable a mano; copy de Pegar Pedido pidiendo marca+tamaño + botón Cancelar; picker de productos distingue categoría vs marca; copy de "Ya lo compré" sin "Otro proveedor"; back físico en Pedido Enviado va a Home.

**Bloque 2 (con migraciones):** `0029` — `abastecimientos.fecha` de `timestamp` a `timestamptz` (causaba desfase de hora en el historial, confirmado por el usuario vía `information_schema.columns`). `0030` — `comercios.activo` para el botón "Eliminar perfil" en Mi negocio (siempre soft-delete, nunca cascade; `MisComercios.listar()` filtra por `activo=true`). `0031` — `barrio`/`ciudad`/`direccion` en `proveedores_maestro`, editable solo-admin en Maestro de proveedores, solo-lectura en la app. `0032` — detección de duplicados de proveedor por nombre+celular (`intentar_auto_vincular_proveedor`, RPC callable por el propio tendero, auto-vincula sin curaduría si celular exacto + nombre similar). Filtro de "Otros proveedores" a Medellín + área metropolitana usando la nueva columna `ciudad` (fail-open si el proveedor no tiene ciudad cargada todavía). "Quitar proveedor" ahora siempre hace soft-delete (se quitó la rama de DELETE real cuando no había historial).

**Bloque 3:** GPS con mapa de confirmación al registrar negocio — `react-native-maps` 1.20.1, nueva pantalla `ConfirmarUbicacionScreen` con pin arrastrable. **No probado en dispositivo** — requiere build de EAS `development` (Expo Go no sirve con este módulo nativo + `newArchEnabled`).

**Ronda de fixes de build de EAS (18 jul 2026, tras varios intentos fallidos):**
1. `extra.eas.projectId`/`owner`/`slug` en el config no coincidían con el proyecto real conectado en GitHub — corregido (owner `jj-tecnologia-sas`, slug `compi`, projectId `bf3ade9c-9f46-4567-9202-ec5d6b7c5797`).
2. `npm ci --include=dev` fallaba: `package.json` traía `react-native-maps` agregado pero `package-lock.json` nunca se regeneró (`npm ci` exige sincronía exacta, a diferencia de `npm install`) — regenerado.
3. `react-native-maps` no tiene `app.plugin.js` (no es un config plugin) — se quitó del array `plugins`; la API key de Google Maps se configura con el campo nativo `android.config.googleMaps.apiKey`, no como plugin.
4. **`app.json` → `app.config.js`**: para que la API key de Google Maps no quede en texto plano en el repo, se convirtió a config dinámico que la lee de `process.env.GOOGLE_MAPS_API_KEY_ANDROID` — variable definida en el dashboard de EAS (Environment variables, marcada "Sensitive"), nunca commiteada.

**Reversión de producto — precio de referencia:** se había implementado (ya existía desde antes, migración `0026`) el prellenado + "Otros tenderos pagan ~$X" + chequeo de sanidad al 25% en `RelacionDetalleScreen`/`NuevoAbastecimientoScreen`. El usuario lo probó en vivo y decidió **quitarlo de la vista del tendero por completo**: genera fricción real (tendero se siente estafado si ve que paga más que otros; proveedor puede sentir expuesta su negociación por tienda). La RPC `precio_referencia` se deja intacta en el backend por si se usa para algo interno/admin más adelante — ninguna pantalla la llama hoy.

**Fix de teclado (Android):** 5 pantallas (`RelacionDetalleScreen`, `RegistroNegocioScreen`, `MiNegocioTenderoScreen`, `PegarPedidoScreen`, `NuevoAbastecimientoScreen`) tenían `KeyboardAvoidingView` con `behavior={ios ? 'padding' : undefined}` — en Android eso es "sin comportamiento", el teclado tapaba el campo en edición. Cambiado a `'height'` en Android; `NuevoAbastecimientoScreen` no tenía `KeyboardAvoidingView` en absoluto, se agregó.

**"Ver/editar datos de contacto" (`RelacionDetalleScreen`) — decisión final de arquitectura:** de toda esa pantalla, el tendero solo edita 4 campos (entrega en tienda, días de pedido, mínimo, si fía). Todo lo demás pasa a ser **dato global del proveedor, solo-admin**, no per-relación:
- `contacto_nombre` y `telefono_secundario` (antes `relaciones.contacto_nombre`/`telefono_contacto_2`, per-relación) se movieron a `proveedores_maestro` (migración `0033`) — editables solo desde Maestro de proveedores.
- El teléfono principal ya venía de `proveedores_maestro.telefono` (actualizado vía el flujo existente "avísale a Compi para actualizarlo" → curaduría → `aprobar_cambio_proveedor` — se confirmó que ese flujo es completo y es el canal correcto, no se duplicó).
- `direccion_entrega` **no se tocó** — sigue siendo per-relación (dirección de entrega de *esa* tienda), congelada de solo lectura. Ojo: si en algún momento se decide que también debería ser global, hay que revisar el nombre/semántica del campo, porque hoy representa algo distinto a la ubicación del proveedor.

**Maestro de proveedores — ficha completa (migraciones `0033`/`0034`):** ahora muestra y permite editar `contacto_nombre`, `telefono_secundario` (además de nombre/categoría/nivel de servicio/barrio/ciudad/dirección, ya existentes); y muestra de solo lectura (calculado en vivo vía RPC `admin_stats_por_proveedor`): # productos distintos que vende, # pedidos históricos en la red, e "indicador de adopción" (Alta/Media/Nuevo-baja) basado en # de tiendas activas — **decisión explícita del usuario**: sin datos reales de calidad (entregas a tiempo, quejas) todavía, se usa volumen de red como proxy. Umbrales (≥5 tiendas = alta, 2-4 = media) son provisionales, recalibrables sin tocar el backend.

## Fix de migraciones que fallaron al aplicar — 18 jul 2026

El usuario corrió `0028`-`0034` a mano y reportó 2 errores (ninguna de las dos llegó a aplicarse, ambas transacciones se revirtieron):

- **`0029`**: `cannot alter type of a column used by a view or rule` — la vista `v_cadencia_producto` (migración `0001`, Motor de Reabastecimiento Predictivo) depende de `abastecimientos.fecha` vía su regla `_RETURN`. Corregido: la migración ahora dropea la vista, altera la columna, la recrea idéntica, y re-aplica el `revoke select ... from anon, authenticated` de la migración `0007` (recrear una vista resetea sus grants).
- **`0034`**: `cannot change return type of existing function` — `0033` ya había creado `admin_stats_por_proveedor()` con 3 columnas de salida; `CREATE OR REPLACE` no permite cambiar el conjunto de columnas `OUT` de una función existente. Corregido: se agregó `drop function if exists admin_stats_por_proveedor();` antes del `create or replace` (y lo mismo en su rollback, que tiene el problema inverso).

Como ninguna de las dos migraciones llegó a aplicarse nunca, se corrigieron los archivos `0029`/`0034` (y sus rollbacks) en el mismo lugar, no con parches nuevos.

**Segunda vuelta en `0029`**: el primer fix solo contempló `v_cadencia_producto`. Postgres siguió bloqueando el `ALTER` porque `v_cobertura_proveedor` y `v_patron_dia_proveedor` (ambas materializadas, migración `0010`) y `v_patron_dia_dominante` (vista regular que depende de `v_patron_dia_proveedor`) también dependen de `abastecimientos.fecha`. Se agregaron a la cadena de drop/recreate, en orden de dependencia, junto con sus índices únicos (necesarios para el `REFRESH CONCURRENTLY` que ya corre por `pg_cron`).

## Segunda ronda de auditoría manual del usuario — 19 jul 2026

8 ítems reportados en un solo mensaje tras probar el build de EAS con el fix de mapa. Migración nueva: `0035` — **no se ha aplicado todavía, correr a mano en el SQL Editor de Supabase**. Verificada localmente contra un esquema stub en Postgres 16 (forward + rollback, incluyendo el caso de aprobar vinculando a un proveedor existente) antes de darla por lista.

1. **Registro de negocio**: "Detalles de ubicación" vuelve a ser opcional (se había marcado obligatorio el 18 jul, el usuario pidió revertirlo — ya no entra en `formCompleto`); "Dirección" cambia el copy a "¿Cuál es la dirección de este negocio?". Mismo commit: el botón "Continuar" se sacó del `ScrollView` a un footer flotante (`position: 'absolute'`, `useSafeAreaInsets`) — el teclado ya no lo tapa.
2. **`ConfirmarUbicacionScreen`**: mismo bug de barra de navegación tapando el botón que ya se había corregido en otras pantallas — le faltaba `useSafeAreaInsets`. Agregado `paddingBottom: 16 + insets.bottom` al footer.
3. **Confirmado (sin cambios de código)**: `ImportarContactosScreen` sí busca primero por celular exacto (+ nombre similar) vía `intentar_auto_vincular_proveedor` (migración `0032`) y solo cae a curaduría pendiente si no hay match — ya funcionaba así desde el 18 jul.
4. **Badge "cubre tu zona"**: antes solo se calculaba en `AgregarProveedorScreen` (para elegir qué agregar). Ahora `ProveedoresTabScreen` también llama `CoberturaProveedor.confianza()` y muestra el mismo badge en los proveedores que el tendero ya tiene vinculados.
5. **Confirmado (sin cambios de código)**: el panel web (`AprobacionPanel.jsx`) ya tenía "fusión" implementada — buscar en el catálogo existente y elegir "Aprobar — vincular a X" vs. "Aprobar — crear nuevo".
6. **Búsqueda por celular**: `ProveedoresTabScreen` y `AgregarProveedorScreen` ahora filtran también por celular (solo dígitos, mínimo 3) además de nombre — mismo dato que ya se le muestra al tendero con el nombre guardado en el Maestro.
7. **Duplicados de solicitud de proveedor (panel web)**: `ProveedoresNuevos.jsx` ahora detecta, entre las sugerencias pendientes, cuáles parecen ser el mismo proveedor real (celular exacto y/o nombre normalizado que coincide/contiene) y muestra un aviso "⚠ Posible duplicado de...". Al aprobar o rechazar una, si hay duplicados se le pregunta al admin (vía `confirm()`) si quiere resolver también las otras con el mismo resultado — al aprobar, todas quedan vinculadas al **mismo** `proveedor_maestro_id` (nunca cada una creando el suyo, si no el "duplicado" reaparece en el Maestro). `aprobarProveedor()` en `api.js` ahora retorna el proveedor resultante para poder encadenar esto.
8. **Nueva pantalla `CrearProveedorScreen`**: hasta hoy la única forma de crear un proveedor era Importar Contactos. Ahora, al final de "Otros proveedores en Compi" en `AgregarProveedorScreen`, hay un botón "+ Crear proveedor nuevo" que lleva a un formulario (nombre, categoría, celular, contacto, celular 2, barrio, ciudad, dirección) y pasa por curaduría igual que todo lo demás. Bloqueo inteligente del lado del cliente: si el celular o la dirección ya coinciden con un proveedor del Maestro, no se envía — se le avisa al tendero que use "Agregar proveedor" para buscarlo. Migración `0035`: agrega esos mismos campos a `proveedores_sugeridos` y actualiza `aprobar_proveedor_sugerido` para copiarlos a `proveedores_maestro` cuando el admin aprueba creando uno nuevo (antes de esto, aunque `proveedores_sugeridos.telefono` ya existía desde `0032`, nunca se copiaba al Maestro al aprobar — quedaba huérfano). `ProveedoresNuevos.jsx` (panel) muestra estos datos capturados dentro de cada tarjeta pendiente. **Nota de alcance**: esto NO cambia la decisión de `0031`/`0033` de que el tendero no propone cambios de ubicación/contacto de un proveedor YA EXISTENTE — aquí el proveedor todavía no existe, es la única fuente de ese dato al momento de crearlo.
9. **`RelacionDetalleScreen` — diferenciación visual**: dentro de "Ver/editar datos de contacto y condiciones", los 4 campos que el tendero sí puede editar (entrega en tienda, días de pedido, mínimo, si fía) ahora tienen un separador con título "Esto sí lo puedes cambiar tú" y color distinto (`COLORS.primary`) — antes usaban el mismo estilo neutro que los campos de solo lectura de arriba, aunque ya estaban bloqueados funcionalmente (ver entrada del 18 jul, "Bloquear todos los campos en Ver/editar datos de contacto").

## Rediseño visual "Nothing Design" para admin-web — propuesto y RECHAZADO — 19 jul 2026

El usuario pidió explorar un rediseño completo de `apps/admin-web/` al estilo Nothing OS/Nothing Phone (blanco puro `#FFFFFF` + negro `#000000` + acento rojo `#FF2E2E`, tipografía monoespaciada en todo, grilla de puntos de fondo, bordes 1px sin `border-radius`, botones invertidos al hover, tablas sin zebra striping, alertas con borde izquierdo rojo en vez de color de fondo). Se pidió explícitamente **solo la vista previa antes de ejecutar, sin tocar código todavía**.

Se armó un preview (Artifact HTML, fuera del repo) replicando con contenido real de la app: Login, Sidebar + Dashboard (KPIs reales de `Dashboard.jsx`), cola de curaduría (`ProveedoresNuevos.jsx`) y la tabla de `MaestroProveedores.jsx`, usando Space Mono (JetBrains Mono servía el mismo archivo para 400 y 700 en el sandbox de prueba — no era problema real de repo, solo del entorno de preview).

**El usuario vio el preview y NO le gustó — decisión explícita: no implementar este rediseño.** Ningún archivo del repo se tocó (el preview vivió solo como Artifact, nunca se escribió a `apps/admin-web/`). `styles.css` de admin-web sigue con su tema oscuro actual (`--page: #0d0d0d`, etc. — ver definición completa arriba en el archivo, sección de variables `:root`).

**Si se retoma la idea de un rediseño de admin-web en el futuro**, no reusar la dirección "Nothing Design" tal cual sin que el usuario la vuelva a pedir explícitamente — ya se descartó una vez.

## Estado del proyecto al cierre de esta sesión — 19 jul 2026 (para retomar en un chat nuevo)

Contexto de arranque para la próxima sesión, sin necesidad de que el usuario lo repita:

- **Rama de trabajo**: `claude/revision-pendientes-proyecto-7o64kg` (ya mergeada a `main` vía PR #46 — para nuevo trabajo, verificar primero con `git merge-base --is-ancestor <último commit> origin/main` si esta rama sigue viva o si hay que recrearla desde `main`).
- **Migraciones aplicadas**: el usuario confirmó que ya corrió a mano en el SQL Editor de Supabase hasta la `0035_crear_proveedor_directo.sql` inclusive (última migración en el repo a la fecha). No quedan migraciones pendientes de aplicar.
- **Build de EAS**: resuelto de punta a punta (projectId/owner/slug corregidos, `package-lock.json` sincronizado, `react-native-maps` sin config plugin propio, API key de Google Maps vía `app.config.js` + variable de entorno EAS). El usuario ya instaló un build funcionando en su celular (incluyendo el mapa de confirmación de ubicación).
- **Todas las tareas de la auditoría manual del usuario (2 rondas, ~19 ítems entre las dos) están cerradas** — ver las dos entradas de arriba ("Auditoría manual 'Sección A'..." del 18 jul y "Segunda ronda de auditoría manual..." del 19 jul) para el detalle completo de cada fix.
- **Pendiente explícito, sin resolver**: el rediseño visual de `apps/admin-web` sigue sin dirección definida — el usuario rechazó "Nothing Design" pero no dio una alternativa. Si en la próxima sesión se retoma el tema de la identidad visual del panel admin, hay que preguntar de cero qué dirección quiere (no asumir, no reofrecer la misma).
- **Reglas de trabajo que siguen vigentes** (ya las conoce quien siga esta sesión, pero quedan aquí por si se pierden en compactación): usar `TaskCreate`/`TaskUpdate` al arrancar bloques de trabajo; revisar `ls supabase/migrations/ | tail` antes de numerar una migración nueva; toda migración de esquema lleva `.sql` + `.rollback.sql` con comentario del porqué; no hay CLI de Supabase — decir siempre explícitamente qué aplicar a mano; buscar patrones ya resueltos en el repo antes de inventar uno nuevo; no scope-creep (anotar en este archivo, no arreglar sin que se pida); verificar siempre antes de dar algo por listo (`node --check` en `.js` de `screens/`, `npm run build` en `apps/admin-web`, sanity check de SQL — este archivo ya tiene el patrón de cómo se hizo un sanity check real con un Postgres local stub, ver la migración `0035`); al cerrar un bloque: commit con mensaje explicando el porqué, entrada fechada en este archivo, y abrir PR sin esperar a que se pida (revisando primero si el PR anterior ya se mergeó).

## Pendientes ya registrados de conversaciones anteriores (no son de esta revisión, se listan para no perderlos)

- **Términos de uso / política de privacidad**: pendiente diseñar antes de lanzar a tenderos reales — `ImportarContactosScreen` envía contactos reales (nombres de terceros) a la API de Anthropic vía `ai-proxy` para clasificación.
- **`pedidos.estado`** en datos sembrados: ya resuelto (sincronizado a `entregado` para Minimercado La 80).
- **`docs/catalogo-matching-unidades.md`** (curaduría-por-coincidencia + estandarización de unidades): diseño completo y aprobado, implementación pausada explícitamente hasta después de gap #2 Fase 3. Fase 3 ya está en producción — **retomable ahora**, si se quiere priorizar sobre Fase 4 o en paralelo.