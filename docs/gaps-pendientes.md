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

### 1. Fricción: productos de "Pegar pedido" nacen sin precio — ✅ resuelto (19 jul 2026)
**Corrección de la premisa original** ("no existe pantalla para fijar el precio"): el tendero **sí puede** fijar `precio_pactado` directamente, sin cola de curaduría admin, en 3 lugares — el precio es dato privado de la relación tienda-proveedor y se escribe directo vía `ProductosRelacionExt.actualizar`:
- **Detalle de proveedor** (`RelacionDetalleScreen`): "Poner precio" / "editar" por producto, y agregar un producto con precio.
- **Nuevo abastecimiento** (`NuevoAbastecimientoScreen`): "Sin precio configurado · tócalo para ponerlo", guarda el precio inline mientras se arma el pedido.
- **Confirmar pedido** (`ConfirmarPedidoScreen`): no bloquea confirmar; muestra "sin precio" por ítem, "Precio incompleto" por proveedor y total "Incompleto".

El residual era de **fricción**: los productos creados desde "Pegar pedido" / "Catálogo detectado" (`PegarPedidoScreen`) nacían con `precio_pactado = null` y ese flujo no invitaba a ponerles precio ahí mismo.

**Decidido:** el precio se fija directo por el tendero, sin curaduría (ratifica el diseño ya implementado). La curaduría admin queda reservada solo para la **existencia** del producto/proveedor en el catálogo maestro compartido.

**Implementado (19 jul 2026), sin migración ni pantalla nueva:**
- `PegarPedidoScreen`: campo de precio opcional (`$`, teclado numérico) por producto detectado. Se manda como `precio_pactado` tanto si el ítem se vincula directo (`ProductosRelacionExt.crear`) como si va a curaduría (`ProductosSugeridos.crear` — la columna `precio_pactado` ya existía ahí desde la migración `0003` y `aprobar_producto_sugerido` ya la copiaba a `productos_relacion` al aprobar, así que no había nada que tocar en el backend).
- `ConfirmarPedidoScreen`: banner "Faltan N precios · ponlos ahora" cuando hay ítems sin precio, tocable. Cada ítem sin precio también es tocable directo ("tócalo para ponerlo"), con el mismo patrón de edición inline que `NuevoAbastecimientoScreen` (`ProductosRelacionExt.actualizar` + estado local `grupos`, en vez de navegar a otra pantalla y perder el borrador del pedido). El total estimado y "Precio incompleto" por proveedor se recalculan en vivo tras cada precio guardado.

### 5. Infraestructura de notificaciones push — ✅ resuelto (21 jul 2026), alcance parcial a propósito
Decisión confirmada con el usuario: **Expo Push Notifications** (candidato natural, el proyecto ya es Expo) — infraestructura completa + 1 disparador reactivo. Quedan 2 disparadores para una vuelta futura, ver abajo.

**Implementado:**
- Dependencias nuevas: `expo-notifications` (~0.32.17) y `expo-constants` (~18.0.13, compatibles con Expo SDK 54) + plugin en `app.config.js`. **Son módulos nativos nuevos — cambian el fingerprint, hace falta un build nuevo de EAS (no basta con OTA) la primera vez que se instale esta versión.**
- Migración `0039`: tabla `push_tokens` (token de Expo por comercio, upsert por `on_conflict=comercio_id,token`) y tabla `notificaciones` (historial — pantalla 24 del diseño, "Notificaciones"). RLS: el tendero solo ve/escribe lo de su propio comercio; **nadie inserta en `notificaciones` directo** (`for insert` sin policy) — solo lo hacen funciones `SECURITY DEFINER`.
- `avanzar_estado_pedido` (migración 0038) ahora, además de lo que ya hacía, inserta una notificación cuando el pedido pasa a `confirmado` o `entregado` — envuelta en su propio `begin/exception` para que un fallo ahí nunca tumbe el avance de estado en sí.
- Nueva Edge Function `supabase/functions/enviar-push`: la dispara un **Database Webhook** (Supabase → Database → Webhooks, **se configura a mano en el dashboard, no hay forma de crearlo por migración SQL**) sobre `INSERT` en `notificaciones`. Busca los `push_tokens` del comercio con la service role key (inyectada automática, sin secreto nuevo que configurar) y llama la API de Expo Push (`https://exp.host/--/api/v2/push/send`, no necesita key propia).
- RN: `notificaciones.js` (pide permiso + registra el token, nunca bloquea — mismo criterio que `capturarUbicacion()`), llamado una vez al entrar a Home (`TabNavigator.js`). Nueva pantalla `NotificacionesScreen` (historial, toca para marcar leída) enlazada desde Perfil con badge de no leídas.
- Verificado con Postgres local (rol de bajo privilegio, no superuser, para que RLS se probara de verdad — el primer intento con `sudo -u postgres` daba falsos positivos porque el superusuario bypasea RLS siempre): no-miembro ve 0 filas, miembro real ve las suyas, insert directo del cliente a `notificaciones` rechazado, notificaciones se generan correctamente en cada transición de estado.

**Pendiente de configurar a mano (no es código, son pasos de dashboard):**
1. **Firebase**: crear/usar un proyecto de Firebase, generar una Service Account Key (Firebase Console → Project settings → Service accounts → Generate New Private Key) y subirla en el dashboard de EAS (Project → Credentials → Android → Service Credentials → FCM V1 service account key). Sin esto, Android no entrega los push aunque todo el código esté bien.
2. **Database Webhook**: Supabase dashboard → Database → Webhooks → nuevo webhook sobre `INSERT` en `notificaciones`, apuntando a la URL de `enviar-push`.
3. **Build nuevo de EAS**: obligatorio por el módulo nativo nuevo (`expo-notifications`) — no aplica por OTA.

**Diferido a propósito para una vuelta futura** (no se tocó en esta ronda):
- Notificar al aprobar/rechazar curaduría (producto o proveedor sugerido) — mismo patrón reactivo que `avanzar_estado_pedido`, pero tocaría 4 RPCs ya revisadas varias veces (`aprobar_producto_sugerido`, `rechazar_producto_sugerido`, `aprobar_proveedor_sugerido`, `rechazar_proveedor_sugerido`) — se prefirió no mezclarlo con la primera vuelta de infraestructura para no arriesgar esas funciones en el mismo cambio.
- Sugerencia de reabastecimiento proactiva ("ya te tocaría reponer X" como push, no solo card al abrir la app) — requiere `pg_cron` + lógica de "no duplicar aviso", es un bloque de trabajo aparte.

> **Gap #6 resuelto (16 jul 2026).** Ver sección Resuelto — el flujo completo ya existe.

### 9. Motor de cobertura de proveedores — piezas sin conectar — ✅ resuelto (19 jul 2026)
El motor en sí (migraciones `0009`/`0010`: `v_cobertura_proveedor`, `v_patron_dia_proveedor`, RPC `cobertura_confianza`) ya estaba en producción y conectado en `AgregarProveedorScreen`. Quedaban 5 piezas sueltas, las 5 cerradas en esta ronda:

- **Campo manual `zonas_cobertura`** — migración `0036` agrega la columna a `proveedores_maestro`. Editable en Maestro de proveedores (`apps/admin-web`), texto libre separado por coma (mismo formato que `categoria`). **Todavía no se lee en ninguna RPC/pantalla del tendero** — queda capturado para cuando se decida usarlo como señal adicional en `cobertura_confianza`; esto es intencional, no un olvido.
- **`cobertura_senales_negativas`** — ahora conectada: `ProveedoresTabScreen` → "Quitar proveedor" tiene 3 botones (Cancelar / **No cubre mi zona** / Quitar). "No cubre mi zona" además desactiva la relación (mismo soft-delete de siempre) e inserta la señal vía `CoberturaSenalesNegativas.crear` (best-effort, un fallo de este insert no bloquea el quitar).
- **Backfill de `lat`/`lng`**: `MiNegocioTenderoScreen` ahora detecta comercios sin coordenadas y muestra un banner + botón "Agregar ubicación" que reusa `capturarUbicacion()` (expo-location) y navega a `ConfirmarUbicacionScreen` — mismo mapa de confirmación con pin arrastrable del registro. `ConfirmarUbicacionScreen` ahora acepta un param `volverAtras` (antes siempre navegaba a `ImportarContactos`, que no aplica fuera de onboarding) para volver a Mi negocio en vez de seguir el paso de onboarding.
- **Sugerencia proactiva en onboarding**: `OnboardingProveedoresScreen`, en el estado final "¡Listo por ahora!" (cuando ya no quedan proveedores vinculados por catalogar), ahora llama `CoberturaProveedor.confianza` y muestra hasta 3 proveedores **no vinculados todavía** con confianza ≥ 0.3 en la zona del comercio, con botón "Ver y agregar" a `AgregarProveedorScreen`. Se puso al final a propósito, para no competir con el héroe de la pantalla (catalogar lo ya vinculado).
- **Normalización de `comercios.barrio`**: se optó por autocompletar, no por una lista cerrada/enum — `constants.js` (RN) y `apps/admin-web/src/constants.js` exportan `BARRIOS_MEDELLIN`, una lista de ~90 barrios conocidos de Medellín (**no exhaustiva ni oficial** — la ciudad tiene ~250 en 16 comunas; una lista incompleta como enum habría bloqueado barrios reales no listados). En RN (`RegistroNegocioScreen`, `CrearProveedorScreen`) se implementó como chips de sugerencia debajo del campo que aparecen al escribir 2+ letras; en admin-web (`MaestroNegocios.jsx`, `MaestroProveedores.jsx`) como `<datalist>` HTML nativo. En ambos casos el campo **sigue siendo texto libre** — la lista solo sugiere, nunca valida ni bloquea.

## Prioridad 3 — Menores, revisar cuando haya tiempo

### 7. Estados de error incompletos (revisado 19 jul 2026)
Solo están documentados/construidos: permisos de contactos denegados, sin conexión.
- **Proveedor que nunca confirma tras reintentos**: **diferido, decisión explícita del usuario.** Hoy no existe ningún reintento automático — el agente de WhatsApp para proveedores sigue bloqueado por el trámite de Meta, y todo el avance de estado de pedido es manual vía `PedidosOperacion.jsx` (admin-web). Construir una pantalla para un disparador que no existe todavía sería prematuro; se retoma si/cuando el bot de WhatsApp exista.
- **Teléfono ya registrado por otro comercio al crear cuenta nueva** — ✅ resuelto (19 jul 2026). Migración `0037` agrega `comercio_por_telefono(p_telefono)` (RPC security definer) que busca comercios **activos** con ese teléfono, excluyendo explícitamente los del propio usuario (`not es_miembro(c.id)`) — así el caso normal de multi-comercio (mismo dueño, mismo teléfono OTP, 2º/3er negocio) nunca dispara el aviso, solo el caso real de un teléfono ya reclamado por OTRO dueño. `RegistroNegocioScreen` la llama antes de crear el comercio; si hay coincidencia, muestra "¿Es tu negocio? ... pide que te agreguen como miembro" con opción "Continuar de todas formas" — nunca bloquea. Verificado con un Postgres local stub (multi-comercio propio → vacío; otro dueño → 1 fila; sin coincidencia → vacío; comercio inactivo → vacío).

### 8. IDC no visible para el tendero — ✅ resuelto (19 jul 2026)
**Decisión explícita del usuario: sí mostrarlo**, como incentivo de adopción. Implementado en `PerfilScreen`: "N proveedor(es) activo(s) en Compi", usando `RelacionesExt.listarActivasPorComercio(comercioId).length` — **número absoluto, no fracción** contra `proveedores_totales` (sigue la corrección ya documentada en `docs/indicadores-dashboard.md`: `proveedores_totales` es una estimación de memoria de una sola vez, dividir podía dar >100% y dejaba de tener sentido). Sin RPC ni migración nueva — el dato ya se podía leer del lado del cliente.

## Resuelto

### Separación de roles admin/tendero (antes gap #2, Fases 1-3) — 16 jul 2026
El panel de admin ya no comparte login sin control con el tendero: Fase 1 agregó la tabla `admins` + `comercio_miembros` con helpers `is_admin()`/`es_miembro()` (`SECURITY DEFINER`); Fase 2 puso Phone Auth real (OTP por SMS) para tenderos en vez del código demo `1234`; Fase 3 activó RLS en las 11 tablas existentes, con políticas basadas en esos helpers. El acceso a datos de otro comercio o a funciones de curaduría ya no depende de ocultar un botón en la UI — está forzado a nivel de Postgres.

### Fase 4 — panel `apps/admin-web/` completo, incluida la cola de curaduría (antes gap #4) — 17 jul 2026
Se construyó y mergeó la app web de admin separada (Vite + React + `supabase-js`, login propio por email/password + chequeo `is_admin()`), con **11 pantallas**: Dashboard, Adopción y retención, Salud de la red, Proveedores nuevos, Productos nuevos (las 2 pantallas de curaduría que este gap pedía — con `AprobacionPanel` compartido, búsqueda de candidato existente por similitud pg_trgm, y botón "Aprobar — vincular a {nombre}" / "Aprobar — crear nuevo"), Cambios pendientes, Maestro negocios, Maestro de proveedores, Maestro de productos, y Pedidos (Operación). Con esto deja de haber un cuello de botella: cualquier admin con fila en `admins` puede aprobar proveedores/productos nuevos sin tocar el SQL Editor. Detalle exhaustivo de cada pantalla en `docs/checklistauditoria.md` sección B.

### Mecanismo manual de confirmación de pedidos (antes gap P1 #3) — 17 jul 2026, RPC + historial 19 jul 2026
Llegó como parte del mismo trabajo de Fase 4: la pantalla **Pedidos (Operación)** en `apps/admin-web/` (`PedidosOperacion.jsx`) tiene un botón "Marcar como {siguiente estado}" por pedido, que avanza `pendiente → confirmado → entregado` y recalcula el estado general del abastecimiento (todos entregado → entregado; mezcla confirmado/entregado sin pendientes → confirmado; cualquier otra combinación → procesando). Cubre la necesidad mientras el agente de WhatsApp para proveedores sigue bloqueado por el trámite de Meta.

**✅ Cerrado (19 jul 2026):** lo que antes eran 2 PATCH directos (`actualizarEstadoPedido`/`actualizarEstadoAbastecimiento`, sin RPC — nada en Postgres impedía un estado fuera de secuencia si se llamaba la API directo) ahora es una sola RPC, `avanzar_estado_pedido(p_pedido_id)` (migración `0038`): no recibe el estado destino como parámetro, solo mueve el pedido al siguiente de la secuencia fija — ni llamándola directo se puede saltar o retroceder. De paso resuelve el pedido del usuario de **historial de estados con fecha/hora** (para medir tiempo entre pedido hecho → confirmado → entregado): la RPC inserta cada transición en la tabla nueva `pedido_estado_historial`, y `PedidosOperacion.jsx` la muestra en el detalle expandido de cada pedido ("Hecho: ... · Confirmado: ... · Entregado: ..."). Verificado con Postgres local (secuencia completa de 2 pedidos con distintos estados intermedios del abastecimiento, intento de avanzar un pedido ya entregado, pedido inexistente, usuario no-admin).

**Diferido explícitamente (decisión del usuario, 19 jul 2026):** estado `cancelado` y modificaciones al pedido — se diseñan junto con el Motor de Enrutamiento de Pedidos, cuando se desbloquee. No se tocó nada de esto en esta ronda.

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

**Nota de seguridad — ✅ cerrada (19 jul 2026)**: `actualizarEstadoPedido`/`actualizarEstadoAbastecimiento` (admin-web) eran PATCH directos a la tabla, sin RPC. Reemplazadas por `avanzar_estado_pedido` (migración `0038`) — ver detalle en "Mecanismo manual de confirmación de pedidos" (sección Resuelto).

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

## Nueva sesión — precio en Pegar Pedido (P2 #1) cerrado — 19 jul 2026

Continuación de la sesión anterior, misma fecha. El usuario pidió listar pendientes; se le presentó la lista de arriba (P2 #1, #5, #9; P3 #7, #8; nota de seguridad de estado de pedido; rediseño admin-web; términos de uso; `catalogo-matching-unidades.md`) y eligió arrancar por **P2 #1** (precio en Pegar Pedido) por ser chico, sin cambios de modelo, y directamente alineado con el héroe del MVP (resurtir rápido).

**Rama de trabajo**: `claude/compi-project-revision-rvqkbq`, creada fresca desde `origin/main` (`d8838cd`, que ya incluye los PRs #46/#47 de la sesión anterior) — sin necesidad de rebase.

Detalle del fix en la entrada de P2 #1 (arriba, sección Prioridad 2). Verificado: `node --check` en todos los `.js` de `screens/` (no solo los 2 tocados). `npm run build` de `apps/admin-web` **no se corrió** — no se tocó ningún archivo de `apps/admin-web` en este bloque y el `node_modules` de esa app no está instalado en este entorno (no es una regresión introducida aquí). Sin migraciones — el campo `precio_pactado` en `productos_sugeridos` y su copiado en `aprobar_producto_sugerido` ya existían desde antes (`0003`/`0011`).

**Quedan pendientes** los mismos ítems ya listados arriba (P2 #5 push, P2 #9 cabos sueltos de cobertura, P3 #7/#8, nota de seguridad de estado de pedido sin RPC, rediseño admin-web sin dirección, términos de uso/privacidad, `catalogo-matching-unidades.md` retomable) — ninguno se tocó en este bloque.

## Cabos sueltos de cobertura (P2 #9) + estados de error (P3 #7) + IDC visible (P3 #8) — 19 jul 2026

Misma sesión que el bloque anterior (precio en Pegar Pedido). El usuario pidió seguir con estos 3 gaps juntos. Antes de tocar código se preguntaron 4 decisiones de producto genuinamente abiertas (no asumidas):

1. **Normalización de `comercios.barrio`/`proveedores_maestro.barrio`** → lista fija de Medellín + área metro, como autocomplete (no enum/validación).
2. **"Proveedor nunca confirma tras reintentos"** → diferido (no hay bot de WhatsApp ni reintentos automáticos hoy, construir la pantalla sería prematuro).
3. **"Teléfono ya registrado por otro comercio"** → aviso simple al detectar coincidencia (no bloquear).
4. **IDC visible al tendero** → sí, mostrarlo como incentivo de adopción.

Migraciones nuevas: `0036` (`zonas_cobertura` en `proveedores_maestro`) y `0037` (RPC `comercio_por_telefono`) — **ninguna se ha aplicado todavía, correr a mano en el SQL Editor de Supabase, en orden**. Ambas verificadas localmente contra un Postgres 16 stub (forward + rollback); `0037` además se probó con 4 escenarios (multi-comercio propio, otro dueño, sin coincidencia, comercio inactivo) — ver detalle en la entrada de P3 #7 arriba.

Detalle completo de cada pieza en las entradas de P2 #9, P3 #7 y P3 #8 (arriba, ya actualizadas in-place en vez de duplicarse aquí). Resumen de archivos tocados:
- `constants.js` / `apps/admin-web/src/constants.js`: `BARRIOS_MEDELLIN`.
- `supabase.js`: `CoberturaSenalesNegativas`, `ComercioPorTelefono`.
- `apps/admin-web/src/screens/MaestroProveedores.jsx`: campo `zonas_cobertura` + datalist de barrio.
- `apps/admin-web/src/screens/MaestroNegocios.jsx`: datalist de barrio.
- `screens/RegistroNegocioScreen.js`: chips de sugerencia de barrio + aviso de teléfono duplicado.
- `screens/tendero/CrearProveedorScreen.js`: chips de sugerencia de barrio.
- `screens/tendero/ProveedoresTabScreen.js`: botón "No cubre mi zona" en Quitar proveedor.
- `screens/tendero/MiNegocioTenderoScreen.js`: banner de backfill de ubicación.
- `screens/ConfirmarUbicacionScreen.js`: param `volverAtras` para reusarla fuera de onboarding.
- `screens/OnboardingProveedoresScreen.js`: sugerencia proactiva de cobertura en el estado final.
- `screens/tendero/PerfilScreen.js`: IDC visible.

Verificado: `node --check` en todos los `.js` de `screens/` + `supabase.js` + `constants.js`; `npm run build` de `apps/admin-web` (con `npm install` fresco, no había `node_modules`) — ambos limpios.

**Sigue sin tocar** (fuera de alcance de este bloque, no se pidió): "proveedor nunca confirma" (diferido explícitamente), rediseño visual de `apps/admin-web`, términos de uso/privacidad, `docs/catalogo-matching-unidades.md`, y la lectura efectiva de `zonas_cobertura` dentro de `cobertura_confianza` (queda capturado en el Maestro pero la RPC todavía no la usa como señal).

## Historial de estados de pedido + Maestros con modal de "Agregar" — 19 jul 2026

Tercer bloque de la misma sesión. El usuario pidió 3 cosas en un solo mensaje:

**1. Historial de estados de pedido con fecha/hora** (para medir tiempo pedido hecho → confirmado → entregado): resuelto vía migración `0038` — ver detalle completo en la entrada "Mecanismo manual de confirmación de pedidos" (sección Resuelto), que también cierra de paso la nota de seguridad del PATCH directo ya documentada desde el 17 jul. El usuario mencionó el estado `cancelado` y "modificaciones al pedido" pero pidió explícitamente diferirlos hasta el Motor de Enrutamiento de Pedidos — no se tocaron.

**2. Resumen de motores** (pedido informativo, sin código): se le presentó en el chat un estado de los 3 motores del proyecto —
- **Motor de Reabastecimiento Predictivo**: ✅ completo en producción (RPC `sugerencia_reabastecimiento`, tabla `reabastecimiento_sugerencias` instrumentada, tarjeta en Inicio, indicadores en Dashboard). Nota: `docs/reabastecimiento-predictivo.md` tiene el encabezado desactualizado ("Fase 3, diseño") — quedó pendiente actualizarlo si se retoma ese doc.
- **Motor de Cobertura de Proveedores**: ✅ completo (ver entrada de P2 #9 arriba).
- **Motor de Enrutamiento de Pedidos**: 🔴 bloqueado por el trámite de Meta (WhatsApp Business API) — sustituido hoy 100% por el avance manual en Pedidos (Operación).

**3. Botón "Agregar" en cada Maestro, con modal y campos obligatorios**: antes de tocar código se preguntó qué hacer con Maestro negocios, que no tenía botón de crear **a propósito** (`crear_comercio` también crea la fila en `comercio_miembros` vinculando al tendero autenticado por OTP — un comercio creado a mano desde el panel quedaría sin dueño, invisible/inoperable desde la app, porque el panel no tiene picker de usuarios). **Decisión del usuario: dejar Maestro negocios sin botón de crear** (se mantiene la restricción existente). Se implementó el modal solo en:
- **`components/Modal.jsx`** (nuevo, compartido): overlay + panel centrado ~50vw, cierra con X/clic afuera/Escape.
- **Maestro de proveedores**: "+ Agregar proveedor" abre el modal con nombre, categorías, nivel de servicio, celular, contacto, ciudad, barrio, dirección (**obligatorios**) + celular 2 y zonas de cobertura (**opcionales** — son datos que genuinamente no todo proveedor tiene; forzarlos habría bloqueado altas legítimas). Reemplaza el card inline de antes.
- **Maestro de productos**: "+ Agregar producto" abre el modal con nombre, presentación, categoría, unidad de empaque, unidades por caja, unidad base (**obligatorios**) + marca (**opcional** — hay productos reales sin marca distinguible, ej. verduras sueltas).

La obligatoriedad se aplicó solo al flujo de **crear**, no se tocó la edición de filas existentes (podrían tener datos legacy incompletos; forzar el guardado de una edición no relacionada habría sido fricción injustificada).

Verificado: `npm run build` de `apps/admin-web` limpio en cada paso; migración `0038` probada contra Postgres local con una secuencia completa de 2 pedidos (transiciones intermedias del abastecimiento, intento de saltar un pedido ya entregado, pedido inexistente, usuario no-admin — los 4 casos fallan como se esperaba).

## Fix de teclado en Confirmar Pedido + ciudades de Colombia — 19 jul 2026

El usuario probó los cambios de PR #48/#49 en el celular (build de EAS + OTA vía `eas-update.yml`) y reportó 3 problemas. Diagnóstico y resultado:

1. **Campo de precio en Pegar Pedido "no aparece"**: revisado el código en `origin/main`, está correcto y sin condición que lo oculte — no se encontró bug. Queda pendiente que el usuario confirme si el build OTA realmente aplicó (ver nota de verificación abajo) antes de seguir investigando esto como bug de código.
2. **Teclado tapa el campo de precio en Confirmar Pedido — ✅ bug real, corregido.** `ConfirmarPedidoScreen` nunca tuvo `KeyboardAvoidingView` (no lo necesitaba antes de esta sesión, no tenía ningún `TextInput`) — al agregarle la edición inline de precio se me olvidó envolverla, mismo patrón de bug ya visto y corregido en otras 5 pantallas el 18 jul. Agregado `KeyboardAvoidingView` (`behavior: padding` en iOS, `height` en Android), igual que `NuevoAbastecimientoScreen`.
3. **Autocomplete de barrio en Registro de negocio "no funciona"**: mismo diagnóstico que el punto 1, código revisado sin bug encontrado — candidato más probable es que el barrio tecleado no esté en la lista `BARRIOS_MEDELLIN` (no exhaustiva) en vez de un fallo real. **Pedido adicional del usuario, sí implementado**: la misma recomendación por lista para el campo "Ciudad", restringida a ciudades de Colombia — `CIUDADES_COLOMBIA` (constants.js RN + admin-web), ~78 ciudades (capitales de departamento + municipios conocidos), mismo criterio que `BARRIOS_MEDELLIN` (sugiere, no valida ni bloquea). Conectado en `RegistroNegocioScreen`, `CrearProveedorScreen` (chips RN) y `MaestroNegocios.jsx`/`MaestroProveedores.jsx` (datalist admin-web). De paso se generalizó el componente `SugerenciasBarrio` a `Sugerencias` (con prop `lista`) en los 2 archivos RN, reutilizado para barrio y ciudad en vez de duplicar el componente.
4. **"Quitar proveedor" sigue mostrando 2 botones en vez de 3**: mismo diagnóstico que 1 y 3, código revisado sin bug.

**Nota de verificación pendiente de confirmar con el usuario**: se verificó por GitHub Actions que el workflow `eas-update.yml` publicó exitosamente (`✔ Published!`, bundle sin errores, mismo runtime version/fingerprint de Android entre las 2 publicaciones — descarta que un cambio nativo haya invalidado la compatibilidad OTA) tanto para el merge de PR #48 como el de PR #49. Como todas las pantallas viven en el mismo bundle JS, si una pantalla nueva (ítem 2) sí refleja el cambio, el resto del mismo bundle también debería estar activo — los ítems 1/3/4 no encajan con un simple "el build no llegó". Se le pidió al usuario, como prueba más simple y sin condiciones (a diferencia de 1/3/4 que dependen de datos o de escribir texto que matchee una lista), revisar la pantalla **Perfil**: debe mostrar una tarjeta verde "N proveedores activos en Compi" (gap P3 #8, sin ninguna condición de datos) — si no aparece tras forzar cierre y reabrir la app, el problema es de propagación del build/OTA y no de código; si aparece, hay que re-probar 1/3/4 con más cuidado (ej. barrio que sí esté en la lista).

Verificado: `node --check` en todos los `.js` de `screens/` + `constants.js`; `npm run build` de `apps/admin-web`.

## Diagnóstico de OTA/EAS + geocodificar dirección en el mapa — 19 jul 2026

**Diagnóstico de por qué el celular no reflejaba los cambios (no era bug de código):** el usuario tenía instalado un APK de un proyecto de Expo completamente distinto — `jjordoneza/compi-v2` (cuenta personal, projectId `d9237162-...`) — mientras que el repo y el workflow `eas-update.yml` siempre apuntaron correctamente a `jj-tecnologia-sas/compi` (projectId `bf3ade9c-...`, confirmado por los logs de GitHub Actions). Ese `compi-v2` es un proyecto huérfano de antes del 18 jul (su build todavía tenía `app.json`, no `app.config.js`) — no se toca, se deja ahí sin usar. Adicionalmente, el último build real de `jj-tecnologia-sas/compi` (PR #45, 18 jul) tenía un runtime version/fingerprint (`9635d75...`) que ya no coincide con el que calcula el `main` actual (`e143b16f...`) — conclusión: hace falta un build nuevo desde ese proyecto (ya confirmado con capturas que tiene GitHub conectado a `jjordoneza/compi-app` y `GOOGLE_MAPS_API_KEY_ANDROID` configurada) para que el OTA vuelva a aplicar. Una vez hecho ese build, los pushes a `main` deberían seguir actualizando solos (ya lo hacían).

**Geocodificar la dirección escrita para el pin del mapa** — pedido del usuario con un caso real: un tendero registró el negocio (dirección correcta, en Laureles) pero terminó el formulario físicamente en otro lugar (Niquía) — el mapa de confirmación abría centrado en el GPS del teléfono (Niquía), no en la dirección que acababa de escribir, lo cual confunde. Se agregó `geocodificarDireccion(direccion, barrio, ciudad)` (usa `Location.geocodeAsync`, ya disponible vía `expo-location` sin key nueva) como fuente **prioritaria** de coordenadas — el GPS del dispositivo (`capturarUbicacion()`) queda como *fallback* solo si la dirección no se pudo ubicar. Aplicado en los 2 lugares que abren `ConfirmarUbicacionScreen`: `RegistroNegocioScreen` (registro nuevo) y `MiNegocioTenderoScreen` (backfill "Agregar ubicación"). El pin sigue siendo arrastrable para ajustar si el geocode no cae exacto.

**"Ver historial de un negocio eliminado" — ✅ resuelto (19 jul 2026), propuesta confirmada por el usuario + botón "Reactivar" que pidió de encima.** El problema: `MiNegocioTenderoScreen` prometía en el diálogo de eliminar que "tu historial de pedidos queda intacto por si lo necesitas después", pero no había ningún camino en la app para llegar a verlo — `MisComercios.listar()` filtra por `activo=true`, así que un negocio desactivado desaparecía de `SeleccionarNegocioScreen`, y si era el único negocio del usuario, `SplashScreen` lo mandaba directo a `RegistroNegocio` (nunca pasaba por Seleccionar). Implementado:
- `MisComercios.listarInactivos()` (nuevo, supabase.js) — mismo query que `listar()`, filtrando `!activo`.
- `SplashScreen`: con 0 comercios activos, ahora revisa si hay inactivos antes de mandar a registro — si los hay, va a `SeleccionarNegocio` en vez de saltárselo.
- `SeleccionarNegocioScreen`: además de los negocios activos, muestra una sección "Negocios eliminados" (estilo atenuado, solo lectura) — cada uno navega a la pantalla nueva en vez de entrar a Home directo.
- **Nueva pantalla `HistorialNegocioEliminadoScreen`** (adaptada de `PedidosTabScreen`, misma lógica de cargar/expandir detalle de abastecimientos — sin tabs ni ninguna acción de escritura sobre catálogo/proveedores) + botón **"Reactivar este negocio"** (con confirmación) que pone `activo = true` vía `ComerciosExt.actualizar` y hace `navigation.reset` directo a Home de ese comercio. No hizo falta ningún cambio de RLS/backend: `es_miembro()` no depende de `comercios.activo`, así que el mismo tendero sigue pudiendo leer/reactivar su negocio eliminado sin tocar políticas.

## Pendientes ya registrados de conversaciones anteriores (no son de esta revisión, se listan para no perderlos)

- **Términos de uso / política de privacidad**: ✅ primer borrador escrito (22 jul 2026) — ver sección nueva abajo. Sigue pendiente que un abogado los revise antes de publicarlos, y llenar los `[COMPLETAR: ...]` con datos reales de la empresa. `ImportarContactosScreen` envía contactos reales (nombres de terceros) a la API de Anthropic vía `ai-proxy` para clasificación — ya cubierto en la política nueva (sección "con quién compartimos datos").
- **`pedidos.estado`** en datos sembrados: ya resuelto (sincronizado a `entregado` para Minimercado La 80).
- **`docs/catalogo-matching-unidades.md`** (curaduría-por-coincidencia + estandarización de unidades): diseño completo y aprobado, implementación pausada explícitamente hasta después de gap #2 Fase 3. Fase 3 ya está en producción — **retomable ahora**, si se quiere priorizar sobre Fase 4 o en paralelo.

## Logo animado + términos/privacidad — 22 jul 2026

El usuario pidió 3 cosas en un solo mensaje, ninguna relacionada con las anteriores.

**1. Ícono de la app con el logo real — ✅ resuelto (22 jul 2026), mismo día.**
El usuario envió el logo (JPEG, wordmark "compi" con una hormiga integrada
en la "i", fondo plano claro ~`#F2F5F6`, casi idéntico a `COLORS.bg`).
Procesado con Pillow (Python, instalado en este entorno para la ocasión —
no hay ImageMagick): se recortó el fondo por distancia de color a los
colores de las 4 esquinas (umbral con feathering para que el borde quede
suave, no un corte duro) para obtener un PNG con transparencia real,
incluyendo los huecos internos de las letras ("o", "p") como transparentes.
De ahí se generaron los 4 archivos que ya usa `app.config.js`:
- `icon.png` (1024×1024, fondo opaco `#F2F8F8`, logo al ~80% del ancho).
- `adaptive-icon.png` (1024×1024, **transparente**, logo al ~62% — dentro
  de la zona segura para que las máscaras circulares/squircle de Android
  no le corten texto).
- `splash-icon.png` (1070×375, transparente, proporción natural del
  wordmark con un padding chico) — el mismo archivo lo usa también el
  splash animado del punto 2.
- `favicon.png` (256×256, mismo criterio que `icon.png`).

De paso, `adaptiveIcon.backgroundColor` en `app.config.js` pasó de
`#ffffff` a `#F2F8F8` para que combine con el logo en vez de dejar un
recuadro blanco alrededor en Android.

**2. Splash animado con el logo antes de Empezar/Home.** Implementado:
- Dependencia nueva `expo-splash-screen` (`~31.0.13` — confirmado con el
  `package.json` real de la rama `sdk-54` de `expo/expo` en GitHub, mismo
  método que ya se usó para `expo-notifications`/`expo-constants`, porque
  adivinar versión mal ya rompió un build antes en este proyecto).
- `app.config.js`: se quitó la clave `splash` legacy (top-level) y se
  agregó como plugin `expo-splash-screen` (imagen, `backgroundColor` ahora
  `COLORS.bg` en vez de blanco puro, para que el splash nativo estático no
  contraste con la pantalla animada que viene después).
- `SplashScreen.js`: `preventAutoHideAsync()` al montar el módulo +
  `hideAsync()` al montar el componente (evita parpadeo en blanco entre el
  splash nativo y este), y una animación `Animated.parallel` (fade +
  scale-spring) del logo antes de continuar con el flujo de rutero que ya
  existía (sesión → comercios → Home/Registro/Seleccionar). Anima
  `assets/splash-icon.png` (el logo real, ver punto 1 arriba) con
  `Image`/`aspectRatio` en vez del wordmark de texto placeholder del primer
  intento.
- **Es un módulo nativo nuevo → mismo fingerprint nuevo que ya exigía
  `expo-notifications`/`expo-constants` (PR #52) → un solo build de EAS
  nuevo cubre ambos cambios**, no hace falta build aparte.

**3. Términos de uso y política de privacidad — primer borrador escrito.**
`docs/terminos-de-uso.md` y `docs/politica-de-privacidad.md` (nuevos).
Ambos marcados arriba del todo como **borrador de trabajo, no publicar
sin que los revise un abogado**, con placeholders `[COMPLETAR: ...]` para
NIT/razón social/correo de contacto reales.

**Pregunta del usuario: ¿es legal monetizar las bases de datos de Compi
más adelante?** Respuesta corta: **sí puede serlo, pero no de cualquier
forma** — no es una decisión de producto libre, está regulada por la
**Ley 1581 de 2012** (habeas data) y el **Decreto 1377 de 2013**:

- Se necesita **autorización previa, expresa e informada del titular**
  para esa finalidad específica — una cláusula genérica de "usamos tus
  datos para mejorar el servicio" **no alcanza** para cubrir venderlos o
  compartirlos con terceros comerciales; hay que decirlo explícito.
- **Por eso la política de privacidad nueva ya incluye esa finalidad**
  (sección 4.3, "uso estadístico y comercial") aunque Compi no la vaya a
  ejercer todavía — pedir ese consentimiento *ahora*, al momento del
  registro, evita tener que volver a pedirle autorización a toda la base
  de usuarios existente el día que se active de verdad. Es la razón
  concreta de escribirlo ya.
- **Dato importante para bajar el riesgo real**: muchos tenderos son
  personas naturales, así que su historial de compras cuenta como **dato
  personal** si se puede rastrear a ellos. Información **agregada o
  anonimizada** (ej. "tendencia de compra por zona/categoría", sin poder
  identificar a un comercio puntual) es much más segura legal y
  reputacionalmente, y probablemente el modelo de monetización con menos
  fricción para empezar — vender datos identificables uno a uno a un
  tercero (ej. a un proveedor competidor) es donde más riesgo regulatorio
  y de confianza del tendero hay.
- **RNBD (Registro Nacional de Bases de Datos, ante la SIC)**: solo es
  obligatorio para empresas con activos por encima de 100.000 UVT
  (~$5.237 millones de pesos para 2026) — Compi hoy está muy por debajo,
  así que **no aplica registrarse todavía**, pero el deber sustantivo de
  la ley (autorización, seguridad, límite de la finalidad, derechos ARCO)
  aplica igual sin importar el tamaño de la empresa.
- **Las sanciones son reales si se hace mal**: la SIC puede multar hasta
  2.000 SMLMV, suspender el tratamiento hasta 6 meses, o cerrar la
  operación — justifica tener un abogado revisando esto antes de activar
  cualquier venta de datos real, no solo antes de publicar la política.

**No implementado en este bloque** (solo la cláusula de autorización que
lo habilita a futuro): ningún mecanismo real de exportar/vender datos a
terceros. Es trabajo aparte, para cuando el usuario decida priorizarlo.

Verificado: `node --check` en `app.config.js` y todos los `.js` tocados;
`package-lock.json` regenerado (`npm install --package-lock-only`,
confirmado que `expo-splash-screen@31.0.13` quedó resuelto). No hay
migraciones ni cambios de `apps/admin-web` en este bloque.