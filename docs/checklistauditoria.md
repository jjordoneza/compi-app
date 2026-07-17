# Compi — Checklist de auditoría exhaustiva

Generada a partir de una lectura completa del código (21 pantallas RN, 11 pantallas/componentes de admin-web, 23 migraciones/RPCs) — no es una checklist genérica, cubre exactamente lo que está construido hoy, incluyendo comportamientos silenciosos, edge cases y un par de bugs reales encontrados durante la revisión (marcados con 🐛).

## Cómo usar esto
- Cada `[ ]` es una prueba manual puntual. Los bloques marcados **🐛 BUG CONOCIDO** no son "verificar que funcione" — son cosas que el código ya muestra que están rotas o son inconsistentes; repórtalas como hallazgos, no como pass/fail.
- Antes de arrancar, corre la sección **0. Pre-requisitos**.
- Los ítems marcados **(GPS)**, **(IA)** o **(red)** requieren condiciones específicas (ubicación real, conexión a Anthropic, o simular fallas de red) — agrúpalos si vas a testear por lotes.

---

## 0. Pre-requisitos antes de empezar

- [ ] **🐛 Aplicar primero el PR #40** (`0027_fix_aprobar_cambio_comercio.sql`) — encontrado durante esta misma auditoría de código: `aprobar_cambio_comercio` (migración 0023, ya en producción) referencia una columna que se eliminó en la migración 0014. Sin este fix, **cualquier intento de aprobar un cambio de teléfono de negocio desde "Cambios pendientes" revienta**. Es el primer bug de toda esta lista, y el más urgente.
- [ ] Confirmar que las migraciones 0001–0027 están aplicadas en Supabase (todas las de este proyecto a la fecha, incluyendo 0024-0026 de unidades/matching/precio de referencia y el fix 0027).
- [ ] Confirmar que hay al menos 1 fila en `admins` con tu `auth.users.id` (para poder entrar al panel admin).
- [ ] Si vas a probar el motor de cobertura (badges "Cubre tu zona" en Agregar proveedor): las vistas materializadas `v_cobertura_proveedor` y `v_patron_dia_proveedor` se refrescan por `pg_cron` cada 6h/24h — después de sembrar datos, correr manualmente:
  ```sql
  refresh materialized view v_cobertura_proveedor;
  refresh materialized view v_patron_dia_proveedor;
  ```
  (Sin `concurrently` — el editor SQL de Supabase Studio envuelve el query en una transacción implícita, y `concurrently` no puede correr dentro de una. El script de siembra ya incluye este refresh al final.) Sin esto, los badges de cobertura no aparecerán aunque los datos ya estén en las tablas base.
- [ ] Tener a mano 2-3 números de celular reales (tuyo o de alguien del equipo) para el login OTP por SMS — es Twilio real, no hay modo demo. El script de siembra deja 3 negocios "hero" pre-cargados listos para engancharse a esos números en el primer login.
- [ ] Confirmar acceso de administrador al proyecto de Supabase (para poder correr `refresh materialized view` y revisar tablas directo si algo no cuadra).

---

## A. App del tendero (React Native)

### A1. Splash / sesión

- [ ] Abrir la app sin sesión previa → ve directo a pantalla "Empezar" (logo + subtítulo), sin quedarse pegado en el spinner.
- [ ] Abrir la app con sesión válida y 0 comercios → redirige directo a Registro de negocio.
- [ ] Abrir la app con sesión válida y 1 comercio → redirige directo a Home de ese comercio.
- [ ] Abrir la app con sesión válida y 2+ comercios → redirige a Seleccionar negocio.
- [ ] **(red)** Simular una red muy lenta/caída durante el arranque → confirmar que NO se queda con el spinner infinito (el código no tiene timeout explícito; si la sesión/lista de comercios nunca resuelve ni falla, se cuelga). Es el edge case más riesgoso de esta pantalla.

### A2. Login (número de celular)

- [ ] Botón "Continuar" deshabilitado con el campo vacío o solo espacios.
- [ ] Escribir menos de 10 dígitos → alerta "Número inválido", no se envía OTP.
- [ ] Escribir más de 10 dígitos (ej. pegar un número con código de país) → se toma silenciosamente los **últimos 10 dígitos**, sin avisar — probar que esto no genere un número equivocado sin que el usuario se dé cuenta.
- [ ] Enviar OTP con éxito → navega a Verificación (con `navigate`, no `replace`: confirmar que el botón atrás desde Verificación sí regresa a Login).
- [ ] **(red)** Forzar un error de red/Twilio al enviar OTP → alerta con el mensaje de error crudo del servidor (verificar que no sea confuso/técnico para un tendero real).

### A3. Verificación OTP

- [ ] Campo limita a 6 dígitos, teclado numérico.
- [ ] Botón "Confirmar" deshabilitado con menos de 6 dígitos.
- [ ] Código incorrecto → alerta "Código incorrecto" (verificar que el texto siga teniendo sentido si el error real es de red y no de código — el título está hardcodeado como "Código incorrecto" sin importar la causa real).
- [ ] Código correcto, comercios previamente sembrados con tu mismo número (últimos 10 dígitos) → `reclamar_comercios_por_telefono()` los engancha automáticamente sin que tengas que crearlos de nuevo.
- [ ] **(red)** Forzar que falle el paso de "reclamar comercios" (la llamada está en un try/catch silencioso) → confirmar que el flujo sigue adelante igual, aunque no reclame nada — puede terminar mandándote a Registro de negocio en vez de a un negocio ya sembrado. Vale la pena verificar explícitamente este camino porque el fallo es 100% silencioso en el código.
- [ ] Después de un error, el código digitado NO se borra (puedes corregir sin retipear todo).

### A4. Registro de negocio

- [ ] Botón "Continuar" deshabilitado con nombre vacío/solo espacios.
- [ ] Campos opcionales (ciudad, barrio, dirección, detalles, nombre de quien atiende) aceptan vacío sin bloquear.
- [ ] Chip de "Tipo de negocio" — tocar el mismo chip dos veces lo deselecciona (vuelve a `''`).
- [ ] Chip de "¿Cómo llegaste a Compi?" — mismo comportamiento de deselección.
- [ ] Stepper "¿A cuántos proveedores le compras?" arranca en 5, no baja de 0, sin techo visible hacia arriba (probar que no rompa la UI con un número muy alto).
- [ ] Guardar negocio exitosamente → navega a Importar contactos (con `replace`, no se puede volver atrás a este formulario).
- [ ] **(GPS)** Con permisos de ubicación concedidos → el comercio termina con `lat`/`lng` (verificar en la tabla, no se le muestra nada al tendero).
- [ ] **(GPS)** Con permisos denegados → el registro se completa igual, sin alertas ni bloqueos, comercio queda sin `lat`/`lng`.
- [ ] **(GPS)** Con ubicación en modo avión / GPS apagado → mismo resultado que arriba, sin errores visibles.
- [ ] **(red)** Si falla específicamente el segundo PATCH que guarda categoría/canal_adquisicion (es una llamada separada de `crear_comercio`) → el comercio ya se creó y navegaste, pero esos 2 campos se pierden silenciosamente. Vale la pena un test explícito de este camino.

### A5. Importar contactos (IA)

- [ ] Permiso de contactos denegado → pantalla dedicada "Necesitamos ver tus contactos" con "Dar permiso" (reintenta) y "Seguir sin esto" (va a Home).
- [ ] Permiso concedido, 0 contactos con nombre → pantalla vacía "No encontramos proveedores", botón único "Continuar".
- [ ] **(IA)** Con contactos reales → la IA (`detectar-proveedores` vía ai-proxy) sugiere cuáles son proveedores y su categoría; contactos detectados como proveedor aparecen pre-marcados.
- [ ] Se puede des-marcar un contacto que la IA marcó como proveedor, y marcar uno que la IA dijo que NO era proveedor (el usuario puede sobrescribir a la IA en ambas direcciones).
- [ ] Con más de 200 contactos en el teléfono → solo se analizan los primeros 200 (truncado silencioso, sin aviso).
- [ ] **(IA)** Forzar un error de la llamada a IA (sin red, o timeout) → pantalla de error dedicada con "Reintentar" y "Omitir por ahora".
- [ ] Confirmar con 0 seleccionados → navega a Home directo, sin alerta ni confirmación de "no se importó nada".
- [ ] Confirmar con selección → crea sugerencias de proveedor (`estado: pendiente`, `canal: whatsapp`) — deben aparecer en el panel admin en "Proveedores nuevos", NO directo en el catálogo maestro.
- [ ] **(red)** Forzar que falle a mitad del guardado con varios contactos seleccionados → confirmar qué pasa si reintentas (el código no hace rollback; podrías terminar con proveedores duplicados si reintentas después de un fallo parcial).

### A6. Pegar pedido de WhatsApp (catálogo)

- [ ] **(IA)** Pegar un texto de pedido real → "Convertir en lista" extrae productos con nombre, cantidad y presentación normalizada.
- [ ] Texto que no produce ningún producto detectado → "No detectamos ningún producto. Intenta con otro texto." (sin botón de guardar visible).
- [ ] **Flujo de coincidencia** (lo nuevo de esta ronda): si un producto detectado hace match con algo que ya existe en el catálogo maestro (`buscar_producto_similar`, mismo `unidad_base`, similitud pg_trgm), aparece la tarjeta "Ya lo tenemos: {nombre} — ¿es este?" con "Sí, es el mismo" / "No, es distinto".
  - [ ] "Sí, es el mismo" → vincula directo al producto existente, **sin pasar por curaduría**, copiando presentación/factor_conversion/unidad_pedido detectados.
  - [ ] "No, es distinto" → va a la cola de curaduría (`productos_sugeridos`) con todos los metadatos (marca, categoría, unidad_base, factor_conversion, unidad_pedido).
  - [ ] Botón "Guardar" queda **deshabilitado y con texto "Confirma las coincidencias de arriba"** mientras haya alguna coincidencia sin resolver.
  - [ ] Producto sin coincidencia detectada → va directo a curaduría, sin mostrar la tarjeta de confirmación.
- [ ] Stepper de cantidad por producto, se puede bajar hasta 0 (y guardar así — verificar si tiene sentido guardar un ítem con cantidad 0).
- [ ] "Quitar" en un producto lo remueve de la lista sin confirmación.
- [ ] Guardado exitoso con productos ya vinculados directo → ofrece "¿Armar un pedido de una vez?" con esos productos precargados.
- [ ] Guardado exitoso con todo yendo a curaduría (0 vinculados directo) → mensaje simple "Entendido", sin oferta de armar pedido.
- [ ] "Intentar con otro texto" conserva el texto original pegado (no lo borra).
- [ ] **(red)** Forzar fallo a mitad del guardado con varios productos → mismo riesgo de duplicados en reintento que Importar contactos.

### A7. Onboarding de proveedores (loop "siguiente proveedor")

- [ ] Se re-evalúa cada vez que la pantalla gana foco (no solo al montar) — agregar productos a un proveedor desde otra pantalla y volver aquí debe sacarlo de la lista de pendientes.
- [ ] 🐛 **BUG POTENCIAL**: esta pantalla no tiene manejo de errores en absoluto. Si la carga inicial falla (red caída, etc.), la pantalla se queda en el spinner **para siempre**, sin mensaje, sin reintento, sin botón de escape. Prueba explícita: simular una falla de red al entrar aquí y confirmar que efectivamente se cuelga.
- [ ] Todos los proveedores con catálogo completo → pantalla "¡Listo por ahora!" con botón único a Home (reset completo del stack).
- [ ] "Armar su catálogo" → navega a Pegar pedido para ese proveedor específico.
- [ ] "Agregar productos manualmente" → navega a Detalle de proveedor.
- [ ] "Saltar este proveedor" → lo oculta solo por esta sesión (no persiste; reaparece la próxima vez que entres a esta pantalla).
- [ ] "Terminar por ahora" disponible en cualquier punto del loop, resetea a Home.
- [ ] Progreso "Proveedor N de X" avanza correctamente tanto al completar catálogo como al saltar.

### A8. Home / Inicio

- [ ] Sin proveedores vinculados → tarjeta única "Todavía no tienes proveedores", nada más se muestra (ni sugerencias, ni stats, ni héroe de repetir).
- [ ] Con proveedores pero sin ningún pedido histórico → CTA "Empezar mi primer pedido" (nunca inventa una sugerencia de "repetir").
- [ ] Con historial de pedidos → tarjeta "Lo de siempre" con fecha del último abastecimiento, "Revisar y enviar" precarga las mismas cantidades.
- [ ] Aviso de "N proveedor(es) sin catálogo" — solo aparece si `proveedoresPendientes > 0` y no fue descartado; el "✕" lo oculta solo por esta sesión (reaparece al recargar).
- [ ] **Sugerencia de reabastecimiento predictivo** (requiere ≥3 compras históricas del mismo producto, ver sección C más abajo):
  - [ ] Aparece máximo UNA sugerencia a la vez, nunca una lista.
  - [ ] "Sí, vamos a surtirlo" → navega a Nuevo abastecimiento con ese producto precargado, y marca la sugerencia como `aceptada`.
  - [ ] "Ya lo compré" → navega a la pantalla de respuesta (ver A9).
  - [ ] **(red)** Si falla silenciosamente el registro de la sugerencia (instrumentación), la sugerencia se sigue mostrando igual pero sin `sugerenciaId` — confirmar que "Sí, vamos a surtirlo" sigue funcionando (navega igual) aunque no quede instrumentado.
- [ ] Stats de negocio (top proveedores, top productos, promedio de gasto) — solo calculadas si hay abastecimientos; con pedidos que tienen precios incompletos, esos pedidos quedan fuera del promedio (no se cuentan como $0).
- [ ] Pantalla en blanco (sin spinner, sin texto) durante la carga inicial — confirmar que no se sienta como "colgada" en una red lenta.

### A9. Respuesta "Ya lo compré" (reabastecimiento)

- [ ] 3 chips de motivo ("Otro proveedor", "Otra app", "Aún tenía inventario") — tocar cualquiera guarda inmediatamente y navega, sin paso de confirmación extra.
- [ ] "Omitir" guarda con motivo `null`.
- [ ] Todos los botones deshabilitados mientras guarda (sin doble-submit).
- [ ] Guardado exitoso → resetea a Home (no se puede volver atrás a esta pantalla ni a la sugerencia).
- [ ] Verificar que la sugerencia deja de aparecer en Home después de esto (por el tiempo calculado según el promedio de intervalo de ese producto).

### A10. Proveedores (tab)

- [ ] Buscador filtra por nombre, case-insensitive.
- [ ] Sin proveedores (o búsqueda sin resultados) → mismo mensaje "No tienes proveedores todavía" en ambos casos (verificar si esto confunde al usuario cuando en realidad SÍ tiene proveedores pero la búsqueda no encontró nada).
- [ ] Tocar el nombre/categoría de un proveedor → va al Detalle de proveedor.
- [ ] "Pegar un pedido de WhatsApp con este proveedor" → va a Pegar pedido con ese proveedor.
- [ ] **Contacto privado por relación** ("Mi contacto con este proveedor"): edición inline, guarda directo sin aprobación (es dato solo tuyo, no global).
- [ ] **Propuesta de cambio de número global** ("avísale a Compi para actualizarlo"): solo se puede proponer si no hay ya una propuesta `pendiente` para ese proveedor.
  - [ ] Enviar propuesta → aparece pill "Pendiente" en amarillo.
  - [ ] Verificar en admin-web (Cambios pendientes) que la propuesta llega ahí.
  - [ ] Aprobarla desde admin → la pill cambia a "Aprobado" (verde) la próxima vez que cargues esta pantalla.
  - [ ] Rechazarla desde admin → pill "Rechazado".
- [ ] **Eliminar proveedor — con historial de pedidos**: alerta explica que se "quita" (soft-delete, `activo=false`), no se borra. Confirmar que desaparece de esta lista pero el historial de pedidos viejos sigue intacto (ver Detalle de pedido / Pedidos tab).
- [ ] **Eliminar proveedor — sin historial de pedidos**: alerta dice que se elimina completo (hard-delete). Confirmar que el catálogo de ese proveedor (productos_relacion) también desaparece.
- [ ] Re-agregar un proveedor previamente "quitado" (soft-delete) desde Agregar proveedor → debe reactivar la relación existente (recuperando su catálogo/precios viejos), NO crear una relación duplicada nueva.
- [ ] "+ Agregar proveedor" → va a Agregar proveedor.

### A11. Agregar proveedor (motor de cobertura)

- [ ] Proveedores ya vinculados activamente NO aparecen en la lista (no se puede re-agregar un duplicado activo).
- [ ] **Badges de cobertura** (requiere `v_cobertura_proveedor` refrescada y al menos 3 comercios con GPS vinculados activamente a un proveedor):
  - [ ] Proveedores con confianza ≥ 0.3 aparecen en sección separada "Con cobertura en tu zona", ordenados por confianza descendente.
  - [ ] Badge "📍 Cubre tu zona" visible en esos.
  - [ ] Si hay un día de la semana dominante de entrega en ese barrio, muestra "Suele entregar los {día} en tu zona" — probar específicamente con domingo (índice 0) para confirmar que no se trata como "sin dato" por error.
  - [ ] Proveedores con confianza < 0.3 van a "Otros", ordenados alfabéticamente.
  - [ ] Sin ningún comercio con GPS o sin suficiente evidencia (mínimo 3) → todos los proveedores caen en "Otros", sin sección de cobertura.
- [ ] Selección múltiple con checkboxes, footer "Agregar (N)" solo aparece con ≥1 seleccionado.
- [ ] Confirmar selección → si había una relación inactiva previa (soft-deleted) para ese proveedor, la reactiva en vez de duplicar.
- [ ] **(red)** Si la llamada de cobertura (`cobertura_confianza`) falla, la pantalla sigue funcionando normal, solo sin badges (falla silenciosa).

### A12. Detalle de proveedor (RelacionDetalleScreen)

- [ ] Acordeón "Ver/editar datos de contacto y condiciones": nombre de contacto, 2 teléfonos, dirección del local, switch "Entrega en tu tienda", días de pedido, pedido mínimo, switch "¿Te fía este proveedor?" — todos guardan juntos con "Guardar datos", sin validación (todo opcional).
- [ ] Refresca datos cada vez que la pantalla gana foco (editar precio en Catálogo Maestro desde admin y volver aquí debe reflejarlo sin recargar la app).
- [ ] Producto sin precio → aviso "Aún no me has dicho cuánto te cobra este proveedor."
- [ ] **Precio con más de 60 días sin actualizar** → aviso separado "Precio de hace más de 2 meses · tócalo si cambió" (constante `UMBRAL_PRECIO_VIEJO_DIAS`).
- [ ] **Precio unitario implícito**: con `factor_conversion > 1`, se muestra junto al precio (ej. "$50.000 ($2.083/unidad)"). Con `factor_conversion` 1 o nulo, no se muestra nada extra.
- [ ] **Prellenado de precio de referencia**: al tocar "Poner precio" en un producto SIN precio, si existe una mediana de red (mínimo 3 comercios con evidencia, excluyendo tu propio comercio), el campo se prellena con esa mediana redondeada, y aparece "Otros tenderos pagan ~$X" debajo — editable, no forzado.
- [ ] Al editar un producto que YA tiene precio, el campo NO se sobreescribe con la referencia (solo se usa para el chequeo de sanidad).
- [ ] **Chequeo de sanidad al guardar precio**: si el precio tecleado se aleja más de 25% de la mediana de red (en cualquier dirección), aparece alerta "Otros tenderos le pagan aproximadamente $X, ¿confirmas $Y?" con "Corregir" (cancela, no guarda) / "Confirmar" (guarda). Probar en ambas direcciones (precio mucho más alto Y mucho más bajo que la referencia).
- [ ] Confirmar que exactamente 25% de desviación NO dispara la alerta (el corte es estrictamente mayor a 25%).
- [ ] Guardar un precio vacío (borrar el campo) → el producto vuelve a estado "sin precio", sin pasar por el chequeo de sanidad.
- [ ] "Eliminar" producto de este proveedor → confirmación explica que el producto sigue existiendo en el catálogo global, solo se desvincula de esta relación.
- [ ] **Picker de agregar producto**: buscador + chips de categoría (single-select, tocar de nuevo deselecciona) + chips de marca (mismo patrón), combinables entre sí y con el texto de búsqueda.
- [ ] Los chips de categoría/marca NO se resetean al cancelar el picker (verificar si esto es intencional o confunde al reabrir).
- [ ] Selección múltiple en el picker → footer sticky "Agregar N producto(s)", todos se crean SIN precio (hay que ponérselo después individualmente).
- [ ] Historial de pedidos con este proveedor: carga perezosa (solo al abrir el acordeón la primera vez); pedidos con algún ítem sin precio muestran "Precio incompleto" en vez de un total.
- [ ] Advertencia visible: el total del historial usa el precio ACTUAL, no el que se pagó en su momento — si cambiaste un precio después, el total de un pedido viejo puede no coincidir con lo realmente pagado. Confirmar que esto se entiende (o al menos documentarlo como limitación conocida, no bug).

### A13. Nuevo abastecimiento (armar pedido)

- [ ] Modo normal (sin parámetros): buscador de proveedor, ordenados por más-usado primero, empate alfabético.
- [ ] Modo "Repetir" (desde Home): precarga cantidades del último abastecimiento, solo muestra por defecto los productos que se pidieron antes ("Ver productos que te vende este proveedor" revela el resto por proveedor).
- [ ] Modo "Desde WhatsApp" (desde Pegar Pedido): precarga las cantidades de los productos recién vinculados.
- [ ] Modo "Reponer sugerido" (desde la sugerencia de reabastecimiento): precarga cantidad 1 del producto sugerido, expande su proveedor.
- [ ] Proveedores sin ningún producto cargado NO aparecen en la lista (ni siquiera como vacío).
- [ ] **Stepper con unidad_pedido pluralizada**: "2 cajas" en vez de solo "2" — probar con varias unidades (caja, unidad, bulto, paca, canasta, libra, botella, bolsa, paquete) y con una NO listada (debe caer a un plural naive tipo "+s"). Sin `unidad_pedido`, cae a "und".
- [ ] Mismo precio unitario implícito y aviso de precio viejo que en Detalle de proveedor (ver A12), con el mismo prellenado de referencia y chequeo de sanidad al guardar inline.
- [ ] Footer: total estimado solo se muestra si TODOS los productos seleccionados tienen precio; si falta alguno, aviso "No podemos calcular el total: N producto(s) sin precio configurado".
- [ ] Botón "Continuar" deshabilitado con 0 productos seleccionados.
- [ ] Al continuar, agrupa correctamente por proveedor y navega a Confirmar pedido.

### A14. Confirmar pedido

- [ ] Por proveedor: subtotal correcto, o "Precio incompleto" si algún ítem no tiene precio.
- [ ] Total general: monto o literal "Incompleto" si falta algún precio.
- [ ] "Enviar abastecimiento" → alerta de confirmación nativa con el conteo de proveedores, Cancelar no hace nada.
- [ ] Confirmar envío exitoso → crea 1 abastecimiento (`estado: procesando`) + 1 pedido por proveedor (`estado: pendiente`) + los `pedido_items` correspondientes; navega con reset completo a Pedido enviado (no se puede volver atrás al formulario).
- [ ] **(red)** Forzar un fallo a mitad del envío (con 2+ proveedores) → confirmar que NO hay rollback: los proveedores ya procesados antes del fallo quedan creados en la base. Reintentar "Enviar" después de esto crearía un SEGUNDO abastecimiento duplicando los proveedores que ya habían funcionado. Es un riesgo real a documentar, no solo probar.

### A15. Pedido enviado / Seguimiento

- [ ] Pedido enviado: pantalla estática de éxito, "Ver seguimiento" (replace) y "Volver al inicio" (reset completo).
- [ ] Seguimiento: 3 pasos visibles por proveedor (Procesando/Confirmado/Entregado), pasos completados con check, incompletos en gris — confirmar que un pedido "confirmado" marca los pasos 1 y 2 como completos (no solo el 2).
- [ ] Refresca automáticamente cada 6 segundos MIENTRAS la pantalla está abierta (probar consumo de red/batería si la dejas abierta un rato largo) y también al recuperar foco.
- [ ] **Los errores de refresco son 100% silenciosos** (solo van a consola, nunca a un Alert) — a propósito, para no interrumpir con alertas repetidas en cada polling. Probar con red intermitente y confirmar que la pantalla no muestra ningún indicador de "estos datos pueden estar desactualizados".
- [ ] "Volver al inicio" resetea el stack completo.

### A16. Pedidos (tab, lista + historial)

- [ ] Refresca en cada foco de la pantalla.
- [ ] Sin pedidos → "Todavía no has hecho ningún abastecimiento."
- [ ] Expandir/colapsar una tarjeta de abastecimiento; el detalle se carga solo la primera vez que se expande (no se re-fetchea en cada toggle, salvo que la pantalla haya recuperado foco con esa tarjeta ya expandida).
- [ ] Badge de estado por proveedor dentro del detalle (pendiente/confirmado/entregado), colores distintos por estado.
- [ ] Subtotal por proveedor, o "Precio incompleto" si aplica.
- [ ] Sin pull-to-refresh manual — confirmar que el refresco por foco es suficiente para el flujo esperado.

### A17. Perfil

- [ ] "Editar mi negocio" → Mi negocio (tendero).
- [ ] "Cambiar de negocio" → Seleccionar negocio.
- [ ] **"Cerrar sesión" — SIN diálogo de confirmación**, acción inmediata al primer toque. Confirmar que esto es intencional (contrasta con otras acciones destructivas de la app que sí confirman).
- [ ] **(red)** Cerrar sesión con la red caída — no hay manejo de error en esta llamada; confirmar qué pasa realmente (posible que la navegación de reset ocurra igual aunque el logout server-side no se haya completado).
- [ ] Confirmar reset completo del navigator raíz a Login (no se puede volver atrás post-logout).

### A18. Mi negocio (tendero, edición)

- [ ] Botón deshabilitado con nombre vacío.
- [ ] Categoría (chip): tocar el chip activo lo deselecciona, dejando la categoría vacía — confirmar que esto se puede guardar así.
- [ ] Ciudad/dirección/detalles/contacto vacíos → se guardan como `null`. **Barrio vacío se guarda como string vacío `''`, no `null`** — inconsistencia menor a verificar si importa para reportes/filtros que esperan `null`.
- [ ] **Solo el teléfono pasa por aprobación admin** (crea `sugerencias_cambio_comercio`, `pendiente`); todo lo demás (incluido nombre de quien atiende) se guarda directo sin aprobación.
- [ ] Cambiar el teléfono → alerta explica que quedó en revisión, navega solo después de cerrar la alerta.
- [ ] Cambiar cualquier otro campo (sin tocar teléfono) → navega directo, sin alerta.
- [ ] El nombre del negocio se refleja de inmediato en Home/Perfil sin necesitar recargar esas pestañas (vía Context compartido).
- [ ] Aviso "Ya tienes un cambio de teléfono en revisión (...)" — confirmar que se actualiza correctamente la próxima vez que entras a esta pantalla después de enviar uno nuevo (esta pantalla navega fuera al guardar, así que hay que volver a entrar para verlo).

### A19. Seleccionar negocio (multi-tienda)

- [ ] Lista ordenada alfabéticamente, muestra barrio o "Sin barrio".
- [ ] Tocar un negocio → Home de ese negocio (`replace`).
- [ ] "+ Registrar otro negocio" → Registro de negocio (con `navigate`, sí se puede volver).
- [ ] Sin negocios (o falla la carga) → mismo mensaje "No hay negocios para mostrar" en ambos casos — no se distingue error de lista vacía real.

---

## B. Panel de administración (`apps/admin-web`)

### B1. Login y control de acceso

- [ ] Login con email/password (auth separada de OTP de tenderos) — confirmar que un tendero NO puede entrar aquí con su sesión de la app.
- [ ] Credenciales inválidas → mensaje de error de Supabase mostrado tal cual (revisar que no filtre información sensible).
- [ ] Usuario autenticado pero SIN fila en `admins` → pantalla bloqueante "Esta cuenta no tiene permisos de administrador" con botón de cerrar sesión — **probar explícitamente con un usuario real que no sea admin**, es el control de acceso más importante de todo el panel.
- [ ] Confirmar que `is_admin()` falla "cerrado" (si la RPC da error, se trata como no-admin, no como acceso libre).
- [ ] Sidebar con 10 secciones, sin ruteo por URL — recargar la página siempre vuelve al Dashboard (no hay deep-linking a una pestaña específica, confirmar que esto es aceptable).

### B2. Dashboard

- [ ] Filtro Día/Semana/Mes afecta SOLO la grilla de KPIs operativos (pedidos, sugerencias, usuarios activos) — el IDC, la tendencia de 30 días, y los indicadores estratégicos NO cambian con este filtro (son ventanas fijas). Confirmar que esto no confunde durante el audit.
- [ ] **IDC**: número absoluto de proveedores gestionados (no porcentaje). Línea de contexto muestra el total autodeclarado al registro, aclarando explícitamente que NO es el denominador de nada. "Ver desglose por comercio" carga una sola vez (no se re-fetchea al cerrar/abrir).
- [ ] Gráfico de tendencia (30 días) con toggle tabla/gráfico y tooltip al pasar el mouse.
- [ ] **Tarjeta de curaduría**: edad del pendiente más viejo, separado por Proveedores y Productos. Se pone en amarillo (`warning`) si supera `UMBRAL_ALERTA_CURADURIA_DIAS` (3 días) — probar cruzando y sin cruzar ese umbral en cada cola por separado (son independientes).
- [ ] **Tarjeta de cobertura**: barra comparativa relaciones-con-evidencia vs sin-evidencia; con total 0 debe mostrar una barra gris neutra completa (no dos segmentos de ancho cero rotos).
- [ ] **Tarjeta de embudo** (30 días): creados vs entregados, tasa de conversión (null si 0 creados, sin división por cero), "no llegaron a entregado" nunca negativo.
- [ ] **Tarjeta de reabastecimiento** (30 días): 4 tiles — pendientes/aceptadas/pospuestas/ignoradas.
- [ ] Si falla cualquiera de las 4 llamadas del dashboard, **toda la pantalla se reemplaza por el mensaje de error** (más agresivo que otras pantallas del panel, que aíslan errores por tarjeta) — confirmar que esto es aceptable o vale la pena suavizarlo.

### B3. Adopción y retención

- [ ] Toggle Semana/Mes en el gráfico de comercios activos, refetch correcto al cambiar.
- [ ] Toggle tabla/gráfico, tooltip en hover.
- [ ] "Tiempo entre registro y primer pedido": promedio, mediana, conteo — "—" cuando no hay datos suficientes.
- [ ] "Tasa de abandono de onboarding": abandonados = nunca importaron contactos NI hicieron un pedido real.
- [ ] **Tabla de cohortes**: retención 30/60/90 días. Cohortes muy recientes deben mostrar **"Aún no medible"**, nunca un 0% engañoso — probar con la cohorte del mes actual.
- [ ] Los 4 fetches de esta pantalla son independientes: si uno falla, los otros 3 igual deben mostrar sus datos.

### B4. Salud de la red

- [ ] **Efecto de red**: vínculos a proveedor reutilizado vs. creado desde cero vs. proveedores con más de 1 comercio activo — 3 métricas genuinamente distintas, confirmar que no se confunden entre sí en los datos sembrados.
- [ ] Tabla de densidad por barrio: comercios activos por barrio, orden y vacíos correctos.
- [ ] **Tabla de señales negativas por proveedor**: fila resaltada con borde rojo y conteo en negrita cuando `total >= UMBRAL_ALERTA_SENALES_NEGATIVAS` (3) — probar cruzando y sin cruzar el umbral.
- [ ] Las 3 tarjetas de esta pantalla fallan independientes entre sí.

### B5. Proveedores nuevos / Productos nuevos (curaduría)

- [ ] Encabezado compartido (`CabeceraCuraduria`) muestra la edad del pendiente más viejo de ESA cola específica (proveedores y productos tienen contadores independientes), con la misma alerta de 3 días.
- [ ] Mini-gráfico de tendencia de resolución (compartido entre ambas colas, mismo admin resuelve las dos).
- [ ] Buscar candidato existente antes de aprobar (`AprobacionPanel`, compartido entre ambas pantallas) — la búsqueda ahora es por **similitud (pg_trgm)**, no por substring exacto. Los datos sembrados incluyen a propósito pares casi-duplicados ("Distribuidora El Sol" / "Distribuidora El Sol SAS", "Huevo AA Canasta x30" / "Huevos AA x30") — buscar uno de ellos debe encontrar al otro como candidato aunque el texto no sea idéntico.
  - [ ] Aprobar **con** un candidato seleccionado → botón dice "Aprobar — vincular a {nombre}", vincula al maestro existente (no crea duplicado).
  - [ ] Aprobar **sin** seleccionar nada → botón dice "Aprobar — crear nuevo", crea una fila nueva en el catálogo maestro.
  - [ ] Probar EXPLÍCITAMENTE ambos caminos — es la decisión de negocio más importante de esta pantalla.
- [ ] Rechazar con motivo opcional (se puede rechazar sin escribir nada).
- [ ] 🐛 **BUG ENCONTRADO**: si la carga inicial de pendientes falla (`listarProveedoresPendientes`/`listarProductosPendientes`), la pantalla se queda mostrando **"Cargando..." para siempre**, nunca llega a mostrar el mensaje de error real (el chequeo de `items === null` tapa al chequeo de `error`). Prueba explícita: forzar un fallo (ej. cortar red justo al entrar) y confirmar que efectivamente se cuelga en "Cargando...".
- [ ] Aprobar/rechazar registra una fila en `admin_audit_log` (verificar por SQL Editor, no hay pantalla de auditoría todavía — ver sección G).

### B6. Cambios pendientes

- [ ] Dos secciones independientes: cambio de número de proveedor y cambio de teléfono de negocio, cada una con su propio vacío.
- [ ] Aprobar cambio de número de proveedor → actualiza `proveedores_maestro.telefono` para TODAS las tiendas que usan ese proveedor (efecto global, confirmar en más de un comercio vinculado al mismo proveedor).
- [ ] Aprobar cambio de teléfono de negocio → actualiza `comercios.telefono` de ese comercio específico solamente.
- [ ] Rechazar con motivo opcional en ambos flujos.
- [ ] Un error en toda la pantalla bloquea el render completo (no aislado por sección, a diferencia de otras pantallas).

### B7. Maestro negocios

- [ ] Única pantalla donde comercios se editan **directo, sin cola de aprobación** (es admin editando su propio dato, no un cambio propuesto por un tendero).
- [ ] Sin crear/eliminar comercios desde aquí (por diseño — solo nacen vía onboarding del tendero).
- [ ] Buscador de texto libre cruza nombre/ciudad/barrio/dirección/teléfono/contacto.
- [ ] Categoría y canal de adquisición editables como `<select>`.
- [ ] Columna GPS de solo lectura, "—" cuando falta lat o lng.
- [ ] Guardar con nombre/barrio vacío — confirmar que no hay validación bloqueante (se puede guardar vacío).

### B8. Maestro de proveedores

- [ ] Categorías: selección MÚLTIPLE (chips), guardadas como string separado por comas — contrastar con Maestro de productos donde es selección única (mismo componente visual, comportamiento distinto — confirmar que ambos funcionan como se espera cada uno).
- [ ] Nivel de servicio: select personal/compi/enterprise, default "Personal (WhatsApp)" si no está seteado.
- [ ] Crear nuevo: nombre requerido, categorías opcionales, sin campo de nivel de servicio en creación (queda en default).
- [ ] 🐛 **Cancelar en modo edición NO revierte los campos** a su valor original (a diferencia de Maestro negocios) — editar, cancelar, volver a editar y confirmar si aparecen los valores abandonados o los originales guardados. Es una inconsistencia real entre pantallas del mismo panel.

### B9. Maestro de productos

- [ ] Marca, presentación, categoría (selección ÚNICA aquí), unidad de empaque, unidades por caja, y la nueva columna **Unidad base** (unidad/kg/litro/—).
- [ ] `unidades_por_caja` con texto no numérico → confirmar qué pasa (el código no valida `NaN` antes de mandarlo al backend).
- [ ] Mismo bug de "Cancelar no revierte campos" que Maestro de proveedores — confirmar ahí también.
- [ ] Crear nuevo requiere nombre; el resto opcional.

### B10. Pedidos (Operación)

- [ ] Filtro Todos/Procesando/Confirmado/Entregado sobre las 3 secciones fijas.
- [ ] Expandir una tarjeta carga el detalle una sola vez (no se re-fetchea en toggles siguientes).
- [ ] "Precio incompleto" cuando algún ítem no tiene `producto_relacion` resuelto o le falta precio — mismo comportamiento que en la app RN.
- [ ] **Botón "Marcar como {siguiente estado}"** — avanza pedido por pedido; recalcula el estado GENERAL del abastecimiento con esta regla exacta:
  - [ ] Todos los pedidos "entregado" → abastecimiento "entregado".
  - [ ] Todos "confirmado" o "entregado" (mezcla, sin ningún "pendiente") → abastecimiento "confirmado".
  - [ ] Cualquier otra combinación → abastecimiento "procesando".
  - [ ] **Probar específicamente el caso mixto**: 2 pedidos confirmados + 1 entregado dentro del mismo abastecimiento → debe quedar "confirmado", NO "entregado". Es la regla más fácil de romper sin darse cuenta.
- [ ] No hay botón de avance en pedidos ya "entregado" (estado terminal).
- [ ] Botones de avance son por-pedido (uno puede estar "Actualizando..." sin bloquear los demás).
- [ ] **Nota de seguridad a verificar**: `actualizarEstadoPedido`/`actualizarEstadoAbastecimiento` son PATCH directos a la tabla, sin RPC de por medio — nada del lado servidor impide setear un estado inválido o fuera de orden si alguien llama la API directo (fuera de esta UI). No es parte del flujo normal a probar, pero vale la pena que quede documentado como superficie sin validar.

---

## C. Motor de Reabastecimiento Predictivo (Fase 3)

Reglas exactas (para diseñar los casos de prueba en la siembra, ver parte 2 de esta respuesta):
- Mínimo **3 compras históricas** (días distintos) del mismo `producto_id` en el mismo comercio.
- `promedio_intervalo` = promedio de días entre compras consecutivas.
- `umbral_dias = promedio_intervalo × 1.3` (multiplicador parametrizable en la RPC, no hardcodeado en la app).
- Candidato solo si `días_desde_última_compra >= umbral_dias` Y no hay un `reabastecimiento_ajustes.no_sugerir_antes_de` vigente para ese producto.
- Se elige el candidato de MAYOR `ratio` (días_desde_última / umbral) — nunca una lista, siempre 0 o 1.

**Nota sobre los datos sembrados**: el script de siembra deja el *historial de compras* cadenciado para que Hero A califique para una sugerencia (4 compras de Gaseosa 1.5L cada ~7 días, última hace 11 días), pero **no pre-crea la fila en `reabastecimiento_sugerencias`** — esa se genera sola, en vivo, la primera vez que Hero A abre Home después del login. Es intencional: es exactamente el camino que hay que probar de punta a punta, no un atajo.

- [ ] Comercio con exactamente 2 compras de un producto (falta 1 para el mínimo) → NO debe aparecer ninguna sugerencia para ese producto.
- [ ] Comercio con 3+ compras pero la última fue reciente (dentro del umbral) → sin sugerencia todavía.
- [ ] Comercio con 3+ compras y `días_desde_última >= umbral` → sugerencia aparece en Home.
- [ ] Comercio con 2+ productos que califican simultáneamente → confirmar que se muestra SOLO el de mayor ratio, nunca los dos.
- [ ] Responder "Ya lo compré" → se crea un `reabastecimiento_ajustes` con `no_sugerir_antes_de` = ahora + el promedio de intervalo de ESE producto; confirmar que la sugerencia no vuelve a aparecer antes de esa fecha.
- [ ] Responder "Sí, vamos a surtirlo" → sugerencia marcada `aceptada`; confirmar que no se sigue mostrando en visitas posteriores a Home.
- [ ] Generar una segunda sugerencia (otro producto) sin haber respondido la primera → la primera debe marcarse `ignorada` automáticamente.
- [ ] Verificar en `reabastecimiento_sugerencias` que `multiplicador_usado`/`promedio_intervalo`/`umbral_dias` quedan congelados con el valor exacto usado al generarse (no se recalculan después).

---

## D. Motor de Cobertura de Proveedores

- [ ] `v_cobertura_proveedor` requiere mínimo **3 comercios con GPS** vinculados activamente (relación `activo=true`) al mismo proveedor para generar un centro/radio — con menos de 3, ese proveedor no tiene fila en la vista (cae siempre a "sin evidencia"/heredado en `cobertura_confianza`).
- [ ] Confianza por decaimiento temporal: un proveedor con evidencia vieja (última actividad hace mucho) debe mostrar confianza más baja que uno con actividad reciente, aunque tengan el mismo número de comercios — probar con 2 proveedores sembrados a propósito con antigüedad distinta.
- [ ] **Herencia por categoría+barrio**: un proveedor SIN evidencia propia en un barrio, pero de la misma categoría que uno que sí tiene evidencia fuerte ahí, debe heredar una confianza descontada (`fuente: heredado`), no cero automático.
- [ ] Comercio consultante SIN GPS → confianza con castigo moderado (0.5 fijo), no cero ni bloqueo.
- [ ] Confirmar refresco manual de las vistas materializadas después de sembrar (ver sección 0) — sin esto, todo este bloque dará "sin evidencia" aunque los datos base estén correctos.
- [ ] `cobertura_senales_negativas` — la tabla y RLS existen pero **no está conectada a ninguna pantalla todavía** (no hay UI para reportar "no cubre mi zona" al eliminar un proveedor). No es un bug, es un gap conocido — no busques esa opción, no existe.

---

## E. Reglas de negocio transversales (verificar que se cumplen en TODA la app, no pantalla por pantalla)

- [ ] El tendero **nunca** puede crear/editar directo un proveedor o producto del catálogo maestro compartido — todo pasa por `*_sugeridos` + aprobación admin. Intentar encontrar cualquier resquicio donde esto no se cumpla.
- [ ] El tendero ve **solo 3 estados** de pedido en toda la app (Procesando/Confirmado/Entregado) — nunca un estado interno más granular filtrado por accidente a la UI.
- [ ] Precios: **nunca** viven en `productos_maestro`, siempre en `productos_relacion` de cada relación — confirmar que el mismo producto maestro puede tener precios distintos en 2 relaciones distintas sin pisarse.
- [ ] Ningún botón/CTA de la app RN queda tapado por la barra de gestos del teléfono (revisar en un dispositivo con notch/gesture bar real, no solo emulador) — varias pantallas tienen fixes explícitos de `insets.bottom`.
- [ ] Áreas táctiles mínimas de 48px en toda la UI nueva (confirmar visualmente, no todos los componentes viejos lo cumplen — no es motivo de bug si es código preexistente, pero sí en lo nuevo).
- [ ] Máximo 3 datos visibles por producto en listas (nombre + presentación/proveedor + precio o cantidad) — confirmar que ninguna lista nueva rompe esto.
- [ ] Ningún mensaje de error técnico crudo (stack trace, código HTTP) llega a la pantalla del tendero sin acompañamiento — sí es aceptable (y ya documentado como gap conocido) que el panel admin muestre mensajes de error más crudos, ya que es para uso interno.

---

## F. Hallazgos de código a re-confirmar en vivo — ✅ los 7 resueltos (17 jul 2026)

Esta sección resumía los 🐛 marcados arriba. Los 7 se confirmaron presentes en el código y se corrigieron — ver `docs/gaps-pendientes.md` sección "Bugs de código de la auditoría exhaustiva" para el detalle de cada fix. Se deja la lista original para trazabilidad:

1. ✅ **Onboarding de proveedores** (A7): sin manejo de errores — un fallo de red al entrar deja al usuario atascado en un spinner infinito, sin salida. *Corregido: try/catch + pantalla de error con "Reintentar".*
2. ✅ **Proveedores nuevos / Productos nuevos en admin** (B5): un fallo al cargar pendientes también se queda en "Cargando..." infinito en vez de mostrar el error real. *Corregido: orden de condiciones invertido + botón "Reintentar".*
3. ✅ **Cancelar edición en Maestro de proveedores / Maestro de productos** (B8/B9): no revierte los campos al valor original guardado, a diferencia de Maestro negocios que sí lo hace. *Corregido: `cancelar()` restaura los campos desde el item original.*
4. ✅ **Envío de abastecimiento con múltiples proveedores** (A14): sin rollback ante fallo parcial — un reintento después de una falla a mitad de camino puede duplicar los proveedores que ya se habían guardado bien. *Corregido: tracking en memoria evita duplicar en el reintento.*
5. ✅ **Guardado de "Pegar pedido" / "Importar contactos"** con varios ítems (A5/A6): mismo riesgo de duplicados en un reintento tras fallo parcial (loops secuenciales sin transacción). *Corregido: mismo patrón de tracking.*
6. ✅ **Mi negocio (tendero)** (A18): `barrio` vacío se guarda como `''`, mientras que ciudad/dirección/detalles/contacto vacíos se guardan como `null` — inconsistencia menor. *Corregido: ahora guarda `null`.*
7. ✅ **Splash** (A1): sin timeout — una llamada colgada (no error, solo nunca resuelve) puede dejar el spinner de arranque infinito. *Corregido: timeout de 8s.*

---

## H. Seguridad / RLS (aislamiento entre comercios y entre tendero/admin)

Esto es lo más importante de probar aunque sea rápido — todo lo demás es UX, esto es aislamiento de datos entre negocios reales.

- [ ] Con el comercio Hero A logueado, intentar ver/editar datos del comercio Hero B por cualquier vía indirecta (IDs adivinados, cambiar params de navegación, etc.) — RLS debe bloquear a nivel de Postgres, no solo esconder el botón en la UI.
- [ ] Confirmar que un tendero (sesión OTP) NO puede entrar al panel admin-web aunque tenga la URL — necesita ser un usuario con auth email/password Y estar en la tabla `admins`.
- [ ] Confirmar que `productos_maestro`/`proveedores_maestro` son de **lectura pública** para cualquier autenticado (`select using (true)`) pero de **escritura solo-admin** — un tendero no debería poder editar el catálogo maestro ni con una llamada directa a la API REST.
- [ ] `cobertura_senales_negativas`: un tendero puede INSERTAR una señal (al eliminar un proveedor sin historial — aunque hoy no hay UI conectada, ver sección G) pero **no puede leerla de vuelta** — solo admin tiene SELECT. Si alguna vez se conecta la UI, confirmar que no intenta mostrarle al tendero sus propias señales ya guardadas (fallaría por RLS).
- [ ] Ningún tendero puede ver la cola de curaduría de OTRO comercio (`proveedores_sugeridos`/`productos_sugeridos` con RLS `es_miembro(comercio_id) or is_admin()`).
- [ ] Confirmar que `admin_audit_log` no es legible ni insertable por un tendero — solo por las RPCs de aprobación (que corren como `security definer`) y solo consultable por `is_admin()`.
- [ ] Intentar hacer un PATCH directo a `pedidos`/`abastecimientos` para cambiar un `estado` a un valor inválido o fuera de secuencia (ej. saltar de `pendiente` a `entregado` sin pasar por `confirmado`) — el código de `api.js` en admin-web y de `supabase.js` en la app no tienen ninguna RPC de por medio para esto, son PATCH directos. Nada a nivel de Postgres valida la secuencia de estados — es una superficie sin protección, vale la pena que quede documentado como hallazgo aunque no sea parte del flujo normal de UI.

## G. Cosas que NO vas a encontrar (gaps conocidos, no son bugs de esta ronda)

- No hay pantalla de auditoría en el panel admin — `admin_audit_log` existe y se llena, pero solo se consulta por SQL Editor.
- No hay confirmación LLM de sugerencia de marca en la cola de curaduría de productos — se pidió explícitamente diferir esto.
- No existe ningún mecanismo (ni manual ni automático) para que un proveedor confirme un pedido por WhatsApp — depende del trámite de Meta Business, no ha arrancado.
- No hay términos de uso / política de privacidad — pendiente antes de un lanzamiento real (relevante porque Importar Contactos ya envía nombres reales a la API de Anthropic).
- No hay UI para que un proveedor marque `disponible=false` en un producto — el campo existe en el esquema, listo para cuando exista el canal de proveedor, pero hoy nadie lo cambia.
