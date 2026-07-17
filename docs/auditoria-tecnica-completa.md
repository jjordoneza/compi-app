# Compi — Auditoría técnica completa: documentos originales vs. implementación

**Fecha del corte:** 17 jul 2026. **Alcance:** todo el código en `compi-app` (app RN del tendero, `apps/admin-web/`, `supabase/migrations/0001`–`0027`, `supabase/functions/ai-proxy/`) contrastado línea por línea contra los 8 documentos disponibles:

- `Compi Book v2` (documento maestro — fusiona y reemplaza a los tres siguientes, los deja como "registro histórico")
- `Compi Arquitectura y Decisiones Técnicas` (histórico, complementario)
- `Compi Estrategia y Fundamentos` (histórico, complementario)
- `Identidad Visual Compi v2`
- `docs/producto.md`, `docs/arquitectura.md`, `docs/pantallas.md` (versión técnica interna, derivada del Compi Book)
- `docs/catalogo-matching-unidades.md`, `docs/reabastecimiento-predictivo.md`, `docs/gap2-plan-roles-rls.md`, `docs/gaps-pendientes.md`, `docs/indicadores-dashboard.md` (diseños técnicos de este repo, sin equivalente en el Compi Book)

**Nota metodológica:** el propio Compi Book v2 tiene una inconsistencia interna que vale la pena señalar antes de empezar: la sección "Identidad de marca" en la Parte I sigue describiendo la paleta vieja ("verde Compi... azul profundo #1F3A5F"), mientras que `Identidad Visual Compi v2` (mismo número de versión) la reemplaza explícitamente por teal+coral. Traté la paleta de `Identidad Visual v2` como la vigente en todo este reporte, porque es el documento dedicado y más reciente — y porque, como se ve en la sección 16, es la que efectivamente quedó implementada.

**Etiquetas usadas:** `[SIN CAMBIOS]` el código hace exactamente lo que describe el documento. `[MODIFICADO]` existía en algún documento pero la implementación difiere (se explica cómo y, cuando se conoce, por qué). `[NUEVO]` no existe en ningún documento original — se construyó sin que estuviera especificado.

---

## 1. Modelo de negocio y estrategia — qué tanto vive en el código

Los documentos de estrategia (Compi Book Parte II, Estrategia y Fundamentos) son en su mayoría decisiones de negocio que no tienen una traducción directa a esquema o pantalla. Se listan aquí solo las piezas que SÍ tienen una huella en el código.

### 1.1 Conector neutral, no marketplace ni mayorista `[SIN CAMBIOS]`
No hay tabla de inventario propio, no hay lógica de compra/venta de Compi como comerciante, no hay márgenes ni logística en el esquema. El modelo de datos completo (comercios/proveedores/relaciones) asume siempre que Compi es intermediario de información, nunca parte de la transacción comercial. Coherente con la tesis en toda la base de código.

### 1.2 Modelo de monetización: el tendero nunca paga `[SIN CAMBIOS, no implementado activamente]`
No existe ninguna tabla de facturación, suscripción, ni cobro a proveedores en el esquema. Es coherente con la decisión documentada ("no cobrar comisión desde el lanzamiento... con evidencia real, por ejemplo con 500 tiendas activas") — el sistema simplemente no tiene ninguna pieza de monetización construida todavía, ni falta que la tenga según el propio documento.

### 1.3 Marketplace Invisible / Catálogo Maestro reutilizable `[SIN CAMBIOS]`
Implementado exactamente como se describe: "si un proveedor ya existe en Compi, un comercio nuevo se vincula al mismo registro en vez de crearlo". Ver sección 8 para el detalle técnico completo (RPCs de aprobación, matching por similitud).

### 1.4 Efecto de red medible `[NUEVO respecto al mecanismo de medición]`
La *idea* de efecto de red está en el documento ("más tiendas → más pedidos → más proveedores interesados"), pero no hay ninguna especificación de cómo medirlo. La RPC `admin_efecto_red()` (migración 0018) es una construcción completamente nueva: mide vínculos "reutilizados" vs. "creados desde cero" vía `row_number() over (partition by proveedor_id order by created_at)` sobre `relaciones` activas (rank=1 → creado_nuevo, rank>1 → reutilizado), y proveedores con más de un comercio activo. Detalle en sección 15.4.

### 1.5 IDC como North Star `[MODIFICADO — cambio de fórmula documentado y deliberado]`
Ver sección 15.1 — es el cambio más importante de todo el reporte, se documenta en detalle allá para no partirlo en dos.

### 1.6 KPIs del primer año `[PARCIAL]`
De los 5 KPIs listados en Estrategia y Fundamentos (sección 8):
- **Comercios activos semanalmente** → `[SIN CAMBIOS]`. Implementado como `comercios_activos_semana_actual` en `admin_stats_estrategicos()` y como serie temporal en `admin_comercios_activos_tendencia(p_granularidad)`.
- **Tiempo promedio por abastecimiento (meta <2 min)** → `[NO IMPLEMENTADO]`. No hay ninguna medición de tiempo-en-pantalla ni de duración del flujo de armar un pedido. Ver sección 19 (brechas).
- **Proveedores gestionados por comercio (2 a 6 en 6 meses)** → `[PARCIAL]`. El dato existe (`admin_idc_por_comercio`, columna `gestionados`), pero no hay ninguna vista que trackee esa progresión en el tiempo por comercio ni el objetivo "2 a 6 en 6 meses" como tal.
- **Retención a 90 días** → `[MODIFICADO/PARCIAL]`. Implementado como tabla de cohortes con retención a 30/60/90 días (`admin_cohortes_retencion()`), más granular que lo pedido (el documento solo pide el número a 90 días, no una tabla de cohortes completa) — en este caso la implementación va *más allá* de lo documentado, no en contra.
- **% del abastecimiento gestionado (IDC)** → ver 1.5/15.1.

### 1.7 Barrios digitalizados como métrica pública `[NO IMPLEMENTADO]`
No existe ninguna agregación por barrio del estilo "barrios digitalizados" ni tracking de densidad de adopción por zona geográfica para uso externo/inversionista. Sí existe `admin_densidad_por_barrio()` (comercios activos por barrio), que es un primo cercano pero mide comercios activos, no "digitalización" del barrio como concepto (que implicaría también proveedores/densidad de cobertura). Ver sección 19.

---

## 2. Arquitectura: "un núcleo, tres interfaces" `[SIN CAMBIOS estructuralmente, MODIFICADO en el detalle de la interfaz 3]`

La regla central ("la lógica de negocio vive en un solo lugar; las interfaces solo muestran y capturan") se respeta de forma consistente en las tres interfaces que sí existen:

- **App del tendero** (Expo/React Native): ningún archivo de `screens/` calcula lógica de negocio real — todo cálculo (precio de referencia, confianza de cobertura, sugerencia de reabastecimiento, aprobación de curaduría) vive en RPCs de Postgres. La única excepción parcial es el cálculo de estadísticas de uso en `InicioScreen.js` (top proveedores/productos, promedio de gasto) que se computa client-side sobre datos ya traídos — no es una regla de negocio nueva, es agregación de presentación, pero técnicamente es lógica fuera del núcleo.
- **Panel de admin** (`apps/admin-web/`, Vite + React + `supabase-js`): confirmado como interfaz de curaduría y métricas, nunca de operación tipo call center — con una salvedad real: `actualizarEstadoPedido`/`actualizarEstadoAbastecimiento` en `api.js` son PATCH directos a la tabla sin ninguna RPC de por medio, es decir, sin ninguna regla de negocio del lado servidor que valide la transición de estado. La lógica de "qué estado sigue" (`siguienteEstado`, `calcularEstadoGeneral` en `PedidosOperacion.jsx`) vive **en el cliente admin-web**, no en el núcleo — es una desviación real, aunque pequeña, del principio arquitectónico.
- **Canal del proveedor**: `[MODIFICADO drásticamente]`. El documento describe tres niveles (Personal/Compi/Enterprise) con un agente conversacional de WhatsApp real operando el nivel Personal. Hoy: `proveedores_maestro.nivel_servicio` existe como campo (migración 0019), pero **no existe ningún agente, ninguna integración con WhatsApp Business API, ningún envío de mensajes real**. El nivel "Personal" es hoy un valor de enum sin ningún canal real detrás. Ver sección 6 y sección 19 (brecha más grande de todo el proyecto).

### 2.1 Las "siete piezas del núcleo" — estado real de cada una

El Compi Book (sección 9) y Arquitectura y Decisiones Técnicas (sección 2) enumeran exactamente siete piezas que deben vivir en el núcleo:

| # | Pieza documentada | Estado |
|---|---|---|
| 1 | Datos maestros (proveedores, productos, relaciones) | `[SIN CAMBIOS]` — sección 4 |
| 2 | Pedidos y abastecimientos (estados, historial, IDC) | `[MODIFICADO]` en estados internos, ver sección 12 |
| 3 | Motor de enrutamiento (divide y despacha por canal) | `[PARCIAL]` — solo divide (abastecimiento→pedidos), no despacha a ningún canal real. Ver sección 6 |
| 4 | Motor de importación (LLM para contactos y pedidos viejos) | `[SIN CAMBIOS]` — sección 5 |
| 5 | Agente conversacional de WhatsApp | `[NO IMPLEMENTADO]` — 0% construido |
| 6 | Motor de Reabastecimiento Predictivo | `[SIN CAMBIOS]` en la fórmula, `[NUEVO]` en la instrumentación — sección 7 |
| 7 | API central, única puerta de entrada | `[MODIFICADO]` — no hay una "API" propia; es PostgREST directo (`fetch` a `/rest/v1/...`) + RPCs de Postgres. Cumple el espíritu (una sola fuente de verdad, sin lógica duplicada) pero no literalmente "una API central" como pieza de software propia |

Además, el código construyó **una octava pieza que no está en ningún documento**: el motor de cobertura de proveedores (`cobertura_confianza`, sección 9). No es una desviación negativa — es una capacidad nueva que ningún documento pidió ni anticipó.

---

## 3. Autenticación y roles `[NUEVO respecto al mecanismo, SIN CAMBIOS respecto a la intención]`

Ningún documento original especifica un mecanismo técnico de autenticación (los mockups de pantallas asumen "4 casillas de código" sin detallar el backend). El mecanismo implementado:

- **Tendero**: Phone Auth real vía Twilio (OTP SMS), `POST /auth/v1/otp` y `POST /auth/v1/verify` directo contra Supabase Auth (sin `supabase-js`, por la restricción de Hermes — ver `CLAUDE.md`). `auth.js` normaliza el número a E.164 colombiano (`aE164`: últimos 10 dígitos + prefijo `+57`, hardcodeado — sin soporte de otros países, aunque la ambición del Compi Book es "Latinoamérica").
- **Admin**: email + contraseña, `supabase.auth.signInWithPassword` (sí usa `supabase-js`, permitido explícitamente para el panel web porque corre en navegador, no en Hermes).
- **Autorización por rol, decidida en Postgres, nunca en el cliente**: tabla `admins` (`user_id` PK → `auth.users`) + helper `is_admin()` (`security definer`, `exists(select 1 from admins where user_id = auth.uid())`); tabla `comercio_miembros` (`comercio_id, user_id, rol default 'dueño'`) + helper `es_miembro(cid)`. Todas las políticas RLS de todas las tablas del sistema usan exclusivamente estos dos helpers — no hay ninguna verificación de rol hecha en JavaScript en ningún punto del código.
- **`reclamar_comercios_por_telefono()`**: mecanismo para enganchar comercios "sembrados" (por ejemplo, por un admin, o antes de que el tendero real se registre) al primer login por OTP — compara los últimos 10 dígitos de `comercios.telefono` contra `auth.users.phone`, ignorando formato/código de país. No documentado en ningún doc original — surgió como necesidad técnica durante la construcción (sección 4 de `gap2-plan-roles-rls.md`).

---

## 4. Modelo de datos de tres capas `[SIN CAMBIOS en el concepto, exacto en la implementación]`

"El producto es global, el precio es de la relación" — la decisión más importante del proyecto según los tres documentos técnicos por igual, y la que con más fidelidad se respetó en el código, sin ninguna excepción encontrada en 27 migraciones.

| Entidad documentada | Tabla real | Columnas que NO estaban documentadas (todas `[NUEVO]`) |
|---|---|---|
| Comercio | `comercios` | `direccion`, `detalles`, `lat`, `lng`, `ciudad`, `contacto_nombre`, `categoria`, `canal_adquisicion`, `terminos_aceptados_en`, `terminos_version` |
| Proveedor Maestro | `proveedores_maestro` | `nivel_servicio` (implementa un concepto documentado — `[SIN CAMBIOS]` — pero el campo en sí no estaba especificado) |
| Relación | `relaciones` | `activo` (soft-delete), `acepta_credito`, más los campos de logística ya anticipados (`dias_pedido`, `minimo_pedido`, `contacto_nombre`, `telefono_contacto`, `telefono_contacto_2`, `direccion_entrega`, `entrega_en_tienda`) |
| Producto Maestro | `productos_maestro` | `unidad_empaque`, `unidades_por_caja`, `marca`, `unidad_base` |
| Producto en Relación | `productos_relacion` | `presentacion` (migrada aquí desde el maestro, ver sección 10), `factor_conversion`, `unidad_pedido`, `precio_actualizado_en`, `disponible` |
| Abastecimiento | `abastecimientos` | — (coincide con lo documentado) |
| Pedido | `pedidos` | — (coincide) |
| — | `pedido_items` | tabla no nombrada explícitamente en los documentos (se infiere de "línea de detalle de un pedido"), pero conceptualmente `[SIN CAMBIOS]` |
| `proveedores_totales` | `comercios.proveedores_totales` | `[MODIFICADO]` en su uso — ver sección 15.1 |

**Cascadas de borrado configuradas**: `relaciones → comercios`, `productos_relacion → relaciones` (documentado explícitamente en `arquitectura.md`). No hay cascada documentada ni verificada con certeza para `abastecimientos/pedidos/pedido_items → comercios`; el script de limpieza de auditoría de esta misma conversación tuvo que asumir borrado explícito en cascada manual precisamente por esta incertidumbre.

---

## 5. Onboarding inteligente

### 5.1 Importar contactos `[SIN CAMBIOS]`
`ImportarContactosScreen.js` + Edge Function `ai-proxy`, acción `detectar-proveedores`. El prompt exacto enviado a Claude (`claude-sonnet-4-6`):

> "Eres un asistente que ayuda a un tendero (dueño de una tienda de barrio en Colombia) a identificar cuáles de sus contactos de celular son probablemente proveedores... Para cada contacto, responde si es probablemente un proveedor y, si lo es, en qué categoría (elige una: Huevos, Lácteos, Bebidas, Snacks, Aseo, Panadería, Carnes, Granos y abarrotes, Cigarrería, Verduras y frutas, Otro)."

Respuesta esperada: `[{"nombre", "esProveedor": bool, "categoria"}]`. Límite duro de `MAX_CONTACTOS = 200` contactos analizados por corrida (truncado silencioso, sin aviso al usuario si tiene más). El tap para marcar/desmarcar coincide exactamente con "marcar cuáles son proveedores con un tap" del documento.

### 5.2 Pegar pedido de WhatsApp → catálogo estructurado `[SIN CAMBIOS en el concepto, ampliado en el detalle capturado]`
`PegarPedidoScreen.js` + `ai-proxy`, acción `extraer-productos`. Ejemplo del propio documento ("vecino regáleme 2 canastas de huevo AA y una de B") corresponde exactamente al placeholder real del campo de texto en el código. El prompt exige devolver `nombre, cantidad, presentacion` — normaliza presentaciones a un vocabulario fijo (`Canasta x30`, `Six pack`, `Botella 1.5L`, `Bolsa 1kg`, `Libra`, `Kilo`, `Paquete`, `Caja`, `Unidad`). A esto se le agregó, sin estar pedido en ningún documento, `[NUEVO]`: `marca`, `categoria`, `unidad_base`, `factor_conversion`, `unidad_pedido` — para alimentar el modelo de unidades estandarizadas (sección 11).

### 5.3 Plantillas de catálogo semilla por tipo de negocio `[NO IMPLEMENTADO]`
La tercera fuente del onboarding inteligente ("un catálogo semilla de 20-30 productos que el 90% de ese tipo de negocio compra, el tendero edita en vez de crear desde cero") **no existe en absoluto**. No hay tabla de plantillas, no hay pantalla, no hay ninguna lógica de arranque en frío basada en tipo de negocio. La columna `comercios.categoria` (tienda_barrio/panaderia/licorera/minimarket/otro, `[NUEVO]`, sección 4) podría ser la base para esto en el futuro, pero hoy no alimenta ninguna plantilla.

### 5.4 Marketplace Invisible durante el onboarding (recomendación proactiva de proveedores del barrio) `[NO CONECTADO]`
El documento dice explícitamente: "la RPC ya devuelve proveedores con cobertura confirmada, pero no está conectada a ninguna pantalla del flujo de registro/onboarding todavía" (`gaps-pendientes.md`, gap #9) — confirmado, sigue así. Existe `proveedores_recomendados_barrio(p_comercio_id)` (RPC, migración 0007) que devuelve proveedores usados por otras tiendas del mismo barrio, pero ningún flujo de `RegistroNegocioScreen`/`ImportarContactosScreen`/`OnboardingProveedoresScreen` la invoca.

### 5.5 Loop breve y abandonable para más de un proveedor `[SIN CAMBIOS]`
`OnboardingProveedoresScreen.js` implementa exactamente el patrón documentado: progreso "Proveedor N de X", "Terminar por ahora" siempre disponible, botón "Saltar este proveedor". Único matiz: el estado de "saltado" es solo de sesión (no persiste en base de datos) — el documento no especifica si debería persistir, así que no es una desviación clara, pero vale la pena señalarlo. También existe el módulo permanente equivalente en `ProveedoresTabScreen`/`PegarPedidoScreen` (pantalla #29 del documento, "Importar catálogo desde WhatsApp" disponible siempre, no solo el día 1) — confirmado `[SIN CAMBIOS]`.

### 5.6 Aviso secundario en Home `[SIN CAMBIOS]`
"Tarjeta secundaria y descartable, nunca reemplaza al héroe principal" — implementado exactamente así en `InicioScreen.js` (`proveedoresPendientes`, con botón "✕" para descartar). El descarte tampoco persiste entre sesiones (mismo matiz que 5.5).

---

## 6. Motor de Enrutamiento y agente conversacional de WhatsApp `[BRECHA MÁS GRANDE DEL PROYECTO]`

Este es el punto donde documento e implementación se separan más. El documento describe un flujo de 7 pasos completamente automático (Compi Book sección 11.2, Arquitectura sección 4):

1. Tendero confirma abastecimiento.
2. Motor de enrutamiento lo divide en pedidos, uno por proveedor. → **`[SIN CAMBIOS]`**: `ConfirmarPedidoScreen.js` sí crea 1 `pedidos` row por proveedor a partir de 1 `abastecimientos` row.
3. Agente envía WhatsApp con botones (Confirmar/Con cambios/No puedo) a cada proveedor. → **`[NO IMPLEMENTADO]`**. No existe ninguna integración con WhatsApp Business API en ningún punto del código. `docs/arquitectura.md` lista el trámite con Meta como "dependencia externa crítica" que debe iniciarse "el día 1" — no hay evidencia en el código de que este trámite haya avanzado ni de que exista infraestructura preparada para consumirlo (no hay webhook, no hay tabla de plantillas de mensaje, no hay número dedicado configurado).
4. Confirmación por botón actualiza el estado solo. → **`[NO IMPLEMENTADO]`**.
5. Texto libre interpretado por LLM. → **`[NO IMPLEMENTADO]`**.
6. Reintentos automáticos, y si fallan, control vuelve al tendero. → **`[NO IMPLEMENTADO]`**.
7. Tendero ve el estado en 3 niveles. → **`[SIN CAMBIOS]`** — esto sí existe (`SeguimientoScreen.js`, `PedidosTabScreen.js`), pero **nada alimenta esos 3 estados automáticamente desde el lado del proveedor**, porque no existe el canal.

**Consecuencia real, ya documentada en `gaps-pendientes.md` (Prioridad 1, ítem #3) pero que sigue sin resolverse**: no existe ningún mecanismo — ni siquiera manual — para que un `pedidos.estado` avance de `pendiente` a `confirmado`/`entregado` **desde el lado del proveedor**. El único mecanismo que existe hoy es el botón "Marcar como {siguiente estado}" en `PedidosOperacion.jsx` (panel admin) — es decir, **un humano de Compi avanza el estado a mano desde el panel**, exactamente el "call center" que la Parte III del Compi Book dice explícitamente que el panel de admin *no* debe ser ("Sala de control, no call center... no se confirman pedidos a mano aquí"). Esta es la contradicción más directa entre documento e implementación de todo el proyecto — no por decisión de diseño, sino porque es el único parche disponible mientras no exista el agente de WhatsApp, y el propio `gaps-pendientes.md` lo registra como "pendiente decidir: un mecanismo manual temporal".

**Pantalla #16 ("Ajuste del proveedor")**: depende enteramente de este agente — `[NO IMPLEMENTADO]`, no existe ninguna pantalla ni tabla para "cambio detectado por LLM, Aceptar/No aceptar".

---

## 7. Motor de Reabastecimiento Predictivo — matemática exacta

### 7.1 Fórmula documentada (Compi Book §11.3, Arquitectura §6, `docs/reabastecimiento-predictivo.md`) vs. implementada

`[SIN CAMBIOS]` en el núcleo matemático, punto por punto:

1. **Mínimo de historial**: "mínimo 3 compras de historial" → RPC `sugerencia_reabastecimiento`, condición `c.num_compras >= 3`. Exacto.
2. **Intervalo promedio**: "promedio de días entre compras sucesivas" → vista `v_cadencia_producto`: `avg(dia - dia_anterior) filter (where dia_anterior is not null)`, con `dia_anterior` calculado vía `lag(dia) over (partition by comercio_id, producto_id order by dia)` sobre compras contadas por **día distinto** (no por transacción — si compras el mismo producto dos veces el mismo día, cuenta una vez).
3. **Margen/multiplicador**: "1.3 veces el promedio" → `umbral_dias = promedio_intervalo * p_multiplicador`, con `p_multiplicador numeric default 1.3` — exacto, y tal como pide el documento ("es parámetro, no constante hardcodeada"), es un argumento de la RPC con default, no un valor fijo en el código de la app.
4. **Condición de disparo**: `dias_desde_ultima >= umbral_dias` → `(current_date - c.ultima_compra) >= (c.promedio_intervalo * p_multiplicador)`. Exacto.
5. **Selección de "una sola sugerencia"**: "una sugerencia a la vez, nunca una lista" → `ratio = dias_desde_ultima / umbral_dias`, se elige el candidato con **mayor ratio** (`order by ratio desc limit 1`). El documento no especifica el criterio de desempate/selección cuando hay varios candidatos calificados simultáneamente — el "mayor ratio" es una decisión de implementación no explicitada en ningún documento, pero consistente con el espíritu (prioriza el producto "más atrasado" relativo a su propia cadencia).
6. **Respeta snooze vigente**: `not exists (select 1 from reabastecimiento_ajustes where ... no_sugerir_antes_de > now())` — implementa "todavía tengo" (sección 7.3 más abajo).

### 7.2 Instrumentación — `[NUEVO]` casi en su totalidad
El documento pide explícitamente instrumentar para poder recalibrar el 1.3x, pero no especifica el diseño de tablas. Todo esto se diseñó desde cero (`docs/reabastecimiento-predictivo.md`, migración 0002):

- Tabla `reabastecimiento_sugerencias`: un registro por sugerencia mostrada, con `promedio_intervalo`, `multiplicador_usado` y `umbral_dias` **congelados en el momento de generarse** (para que cambiar el multiplicador después no distorsione el histórico), `respuesta` (`pendiente/aceptada/pospuesta/ignorada`), `respondida_en`, `ajuste_id`, `compra_confirmada_en` (campo para "verdad de campo" — cuándo ocurre la compra real después de la sugerencia — anticipado en el diseño pero **nunca poblado por ningún código**: no existe el job/trigger que la propia doc menciona como "PR-C, después").
- **Restricción a nivel de base de datos, no solo de UI**: índice único parcial `uq_reab_sug_comercio_producto_pendiente on (comercio_id, producto_id) where respuesta = 'pendiente'` — impide dos sugerencias pendientes simultáneas para el mismo par (comercio, producto) aunque la app dispare dos inserts casi simultáneos. No estaba pedido explícitamente, es una salvaguarda añadida durante la construcción.

### 7.3 Recalibración con la respuesta del tendero
- **"Sí, vamos a surtirlo"** → `respuesta = 'aceptada'`, navega a `NuevoAbastecimientoScreen` con el producto precargado (`sugerirProductoRelacionId`). `[SIN CAMBIOS]`.
- **"Ya lo compré por otro lado"** → `[SIN CAMBIOS respecto al concepto, MODIFICADO en el detalle matemático]`. El documento dice: "se ajusta la fecha base del ciclo, para no volver a generar la misma señal al día siguiente". La implementación real (`ReabastecimientoRespuestaScreen.js`) calcula `no_sugerir_antes_de = now() + promedio_intervalo días` — es decir, usa el **intervalo completo**, no solo "un día". El documento en ningún punto especifica la duración exacta del snooze más allá de "no repetir al día siguiente" — la implementación fue más allá de esa frase literal y usó el intervalo promedio del producto como ventana de silencio, una interpretación razonable pero no una copia literal del texto.
- **"Todavía tengo" / recalibración por extensión de intervalo**: `[NO IMPLEMENTADO]`. El documento describe explícitamente un tercer camino de respuesta ("si responde 'todavía tengo', el intervalo se extiende") como parte de la recalibración — **este camino no existe en la UI**. `ReabastecimientoRespuestaScreen.js` solo ofrece 3 motivos fijos para "ya lo compré" (Otro proveedor / Otra app / Aún tenía inventario) más "Omitir" — no hay un botón "todavía tengo" que extienda el intervalo sin registrar una compra en otro lado. Es una **brecha real** entre lo documentado (dos caminos de respuesta con lógica de recalibración distinta cada uno) y lo implementado (solo un camino de "no" está construido, con un solo comportamiento de snooze).
- **Recalibración empírica del multiplicador con datos acumulados** ("con `promedio_intervalo`, `multiplicador_usado` y `compra_confirmada_en` por evento, se calcula el multiplicador empírico ideal") → `[NO IMPLEMENTADO]`. Los datos para hacerlo están siendo capturados (ver 7.2), pero no existe ningún job, RPC ni pantalla que calcule o aplique ese multiplicador recalibrado — el sistema sigue usando `1.3` fijo como default en cada llamada.

### 7.4 Notificaciones agrupadas por comercio `[NO IMPLEMENTADO]`
"Las señales del día se agrupan en una sola notificación por comercio, nunca por producto" — no hay ninguna infraestructura de push notifications en el proyecto (confirmado también como gap explícito en `gaps-pendientes.md` #5, "resuelto" solo en el sentido de que se decidió no requerirla para el MVP). Hoy la sugerencia solo aparece dentro de `InicioScreen.js` cuando el tendero abre la app — no hay ningún mecanismo de notificación push ni de WhatsApp que la empuje proactivamente. Como la regla es "una sugerencia a la vez" por diseño (sección 7.1, punto 5), el requisito de "agrupar por comercio" es en la práctica un no-problema hoy (nunca hay más de una sugerencia pendiente que agrupar), pero la entrega proactiva en sí no existe.

---

## 8. Catálogo Maestro, curaduría y "Marketplace Invisible" — mecanismo de aprobación

### 8.1 Las cuatro tareas de curaduría documentadas

El Compi Book (sección 12) lista exactamente 4: aprobar proveedores nuevos, fusionar duplicados, revisar calidad de promociones, validar productos nuevos sugeridos. (Nota: Arquitectura y Decisiones Técnicas, en su sección 7, lista solo 3 y omite "validar productos nuevos" — inconsistencia interna entre los propios documentos históricos; tomé el Compi Book v2, más reciente, como fuente de verdad).

| Tarea documentada | Estado |
|---|---|
| Aprobar proveedores nuevos | `[SIN CAMBIOS]` — `proveedores_sugeridos` + RPC `aprobar_proveedor_sugerido`/`rechazar_proveedor_sugerido`, pantalla "Proveedores nuevos" en admin-web |
| Validar productos nuevos sugeridos | `[SIN CAMBIOS]` — `productos_sugeridos` + RPC `aprobar_producto_sugerido`/`rechazar_producto_sugerido`, pantalla "Productos nuevos" |
| Fusionar duplicados | `[NO IMPLEMENTADO como herramienta explícita]` — ver 8.4 |
| Revisar calidad de promociones | `[NO IMPLEMENTADO]` — no existe el concepto de "promoción" en ningún punto del esquema ni de la UI. Ver sección 19 |

### 8.2 RPCs de aprobación — lógica exacta

`aprobar_proveedor_sugerido(p_sugerido_id, p_proveedor_maestro_id default null)`:
- Si `p_proveedor_maestro_id` es `null` → crea una fila nueva en `proveedores_maestro` (implementa "producto/proveedor genuinamente nuevo, va al catálogo").
- Si no es `null` → reutiliza el existente (implementa el Marketplace Invisible: "vincula al mismo registro en vez de crear uno").
- Busca si ya existe una `relaciones(comercio_id, proveedor_id)`: si existe pero está inactiva (`activo=false`, soft-delete previo), la **reactiva** en vez de duplicar — comportamiento no descrito en ningún documento, surgió de la necesidad de coexistir con el soft-delete de proveedores (sección 13).
- Registra en `admin_audit_log` (`[NUEVO]`, sección 17) quién aprobó, cuándo y con qué decisión.

`aprobar_producto_sugerido(...)` sigue el mismo patrón, con una regla adicional no documentada: si el `productos_relacion` ya existía (reenvío duplicado de la misma sugerencia), el precio se actualiza con `coalesce(nuevo, existente)` — nunca borra un precio ya cargado por accidente de un reenvío.

### 8.3 Matching por similitud (pg_trgm) `[NUEVO — mecanismo; el objetivo ya estaba documentado]`
Ningún documento especifica CÓMO detectar que "Coca-Cola 1.5L" y "Coca Cola 1.5" son el mismo producto. `docs/catalogo-matching-unidades.md` (diseño interno de este repo, sin equivalente en el Compi Book) lo resuelve con la extensión `pg_trgm` de Postgres:
- `buscar_producto_similar(p_nombre, p_unidad_base, p_umbral default 0.35)`: candidatos de `productos_maestro` con la **misma `unidad_base`** (filtro exacto) y `similarity(nombre, p_nombre) >= p_umbral` (score de trigramas), ordenados por similitud descendente, límite 5.
- `buscar_proveedor_similar(p_nombre, p_umbral default 0.35)`: mismo patrón sin filtro de unidad.
- `ai-proxy` llama estas RPCs automáticamente después de extraer productos/proveedores de un pedido pegado o de contactos, y adjunta la mejor coincidencia (`coincidencia`) a cada ítem — el tendero confirma "¿es este?" antes de guardar (`PegarPedidoScreen.js`).
- El panel admin las reutiliza con un umbral más permisivo (`p_umbral: 0.2`, en vez de 0.35) para la búsqueda manual en `AprobacionPanel.jsx` — más resultados porque un humano revisa visualmente, distinto criterio que la coincidencia automática mostrada al tendero.

Nunca se creó la lógica de "presentación por relación" completa que el mismo documento diseñaba originalmente en su versión más ambiciosa (mover TODA la presentación del maestro a la relación) — se optó por un modelo más liviano: `productos_relacion.presentacion` existe y se usa con fallback al maestro (`item.presentacion || producto.presentacion`), pero `productos_maestro.presentacion` **no se volvió "legacy" de forma estricta** — ambas siguen coexistiendo activamente.

### 8.4 Fusionar duplicados `[NO IMPLEMENTADO como tarea de curaduría]`
No existe ninguna pantalla ni RPC de "fusionar" dos registros de `proveedores_maestro` o `productos_maestro` que ya se crearon como duplicados (por ejemplo, si el matching por similitud no capturó el caso y dos entradas separadas terminaron existiendo). El matching por similitud (8.3) **previene** nuevos duplicados hacia adelante, pero no hay herramienta para **resolver** duplicados que ya existen — la única vía indirecta seria borrar uno a mano desde `MaestroProveedores.jsx`/`MaestroProductos.jsx` y re-vincular las relaciones manualmente, lo cual no es una fusión real (perdería el historial de curaduría/auditoría del registro eliminado).

### 8.5 Curaduría admin — salud de la cola `[NUEVO]`
No documentado en ningún doc original: edad del pendiente más antiguo por cola (`curaduria_edad_pendiente_proveedores_dias`/`_productos_dias`, calculada como `extract(epoch from (now() - min(created_at))) / 86400.0` sobre filas `pendiente`), con alerta visual si supera `UMBRAL_ALERTA_CURADURIA_DIAS = 3` días (constante en `apps/admin-web/src/constants.js`), y tendencia de tiempo de resolución por semana (`admin_curaduria_resolucion_tendencia`, promedio de `resuelto_at - created_at` en horas, agrupado por semana).

---

## 9. Motor de Cobertura de Proveedores `[NUEVO — no existe ningún equivalente en ningún documento original]`

Esta es la pieza construida más grande que no tiene ninguna raíz documental. Ningún documento (ni el Compi Book, ni Arquitectura, ni Estrategia) menciona geolocalización, confianza de cobertura, ni nada relacionado. Se documenta aquí con el mismo nivel de detalle matemático que el resto porque el usuario pidió "las matemáticas exactas donde aplique", y esta pieza tiene bastantes.

### 9.1 Captura de coordenadas `[NUEVO]`
`comercios.lat`/`lng` (migración 0009), capturadas silenciosamente por GPS al registrar el negocio (`RegistroNegocioScreen.js`, `Location.getCurrentPositionAsync({accuracy: Balanced})`), nunca mostradas al tendero, sin bloquear el registro si el permiso se niega.

### 9.2 `v_cobertura_proveedor` (vista materializada, migración 0010)
Por cada `proveedor_id`, sobre relaciones activas de comercios con GPS:
- **Centro** = mediana (`percentile_cont(0.5)`) de `lat`/`lng` de esos comercios — mediana, no promedio, "para que una tienda excepcionalmente lejana no arrastre el centro".
- **Radio** = percentil 75 (`percentile_cont(0.75)`) de la distancia (km, vía `earth_distance`/`ll_to_earth` de la extensión `earthdistance`) de cada comercio al centro — p75, no máximo, mismo criterio de robustez contra outliers.
- **Última actividad** = fecha del pedido `entregado` más reciente de esa relación, o `relaciones.created_at` si nunca hubo entrega (ancla más débil).
- **Mínimo de evidencia**: `having count(*) >= 3` comercios — mismo umbral que el motor de reabastecimiento (3 compras).
- Refrescada por `pg_cron` cada 6 horas (`refresh materialized view concurrently`, cron `0 */6 * * *`).

### 9.3 `v_patron_dia_proveedor` (migración 0010)
Por `(proveedor_id, barrio, día de la semana)`, cuenta de entregas, mínimo 3 para tener significancia. Refrescada diariamente a las 3am. Alimenta "suele entregar los {día} en tu zona".

### 9.4 `cobertura_confianza(p_comercio_id, ...)` — la fórmula completa
RPC con 4 parámetros de calibración, todos con default, todos ajustables sin tocar la vista ni la app (mismo principio que el `1.3` del motor de reabastecimiento):

- `p_vida_media_dias = 60`: días para que la confianza por inactividad se reduzca a la mitad.
- `p_saturacion_comercios = 8`: número de comercios a partir del cual la evidencia "satura" (no sigue subiendo la confianza).
- `p_descuento_heredado = 0.5`: penalización al heredar confianza de un proveedor similar sin evidencia propia.
- `p_factor_radio_max = 2.0`: más allá de este múltiplo del radio, confianza en el punto = 0.

**Decaimiento temporal** (exponencial por vida media):
```
decay = 0.5 ^ (días_desde_última_actividad / 60)
```

**Confianza "propia"** (el proveedor SÍ tiene evidencia):
```
confianza = min(1, num_comercios / 8) × decay × factor_distancia
```
donde `factor_distancia` es:
- `0.5` si el comercio consultante no tiene GPS (castigo moderado, no cero).
- `1.0` si la distancia al centro ≤ radio.
- `1.0 − (distancia − radio) / max(radio, 0.1)` si la distancia está entre 1x y 2x el radio (decae linealmente).
- `0.0` más allá de 2x el radio.

**Confianza "heredada"** (el proveedor NO tiene evidencia propia, pero hay proveedores similares con evidencia en el mismo barrio):
```
confianza_heredada = avg(confianza de proveedores activos, misma categoría, mismo barrio) × 0.5
```
Match de categoría por **solapamiento de tokens** (`string_to_array(cat1, ', ') && string_to_array(cat2, ', ')`) — un proveedor con categorías "Bebidas, Snacks" hereda de cualquier proveedor con al menos una categoría en común. `fuente = 'sin_evidencia'` si el comercio consultante ni siquiera tiene barrio declarado (no hay de dónde heredar).

**Nunca bloquea**: siempre devuelve un número (0 a 1) para todo `proveedores_maestro`, con `fuente` indicando de dónde salió (`propio`/`heredado`/`sin_evidencia`) — el cliente decide qué hacer con el valor, nunca es una validación dura.

### 9.5 Dónde se usa
`AgregarProveedorScreen.js`: umbral fijo `UMBRAL_COBERTURA = 0.3` (constante en el cliente, no en la RPC) separa proveedores en "Con cobertura en tu zona" (badge "📍 Cubre tu zona", ordenados por confianza descendente) vs. "Otros" (orden alfabético). También muestra el día dominante de entrega si `fuente = 'propio'`.

### 9.6 Piezas del motor de cobertura sin conectar (auto-reportado, sigue así)
`gaps-pendientes.md` (gap #9) documenta 3 piezas construidas pero sin UI, y las 3 siguen exactamente igual:
- `cobertura_senales_negativas` (tabla + RLS existen desde 0010) — sin ningún punto de captura en la UI (el diálogo de "Eliminar proveedor" en `ProveedoresTabScreen.js` no ofrece capturar el motivo "no cubre mi zona").
- Campo manual `zonas_cobertura` (señal secundaria declarada a mano por un admin) — nunca se construyó.
- Backfill de `lat`/`lng` para comercios registrados antes de esta migración — nunca corrido (comercios viejos siguen sin coordenadas salvo que se editen a mano).

---

## 10. Precio: modelo, precio de referencia y chequeo de sanidad `[NUEVO en gran parte, sobre una base documentada]`

### 10.1 Precio como dato de la relación `[SIN CAMBIOS]`
Confirmado en el 100% del código: `precio_pactado` vive únicamente en `productos_relacion`, nunca en `productos_maestro`. Ni una sola consulta del código lee un precio del maestro.

### 10.2 Precio de referencia calculado — `[NUEVO, sin ningún antecedente documental]`
```
mediana = percentile_cont(0.5) de precio_pactado
          de TODOS los demás comercios (excluyendo al que consulta)
          para el mismo (proveedor_id, producto_id)
          sobre relaciones activas
          con mínimo 3 comercios de evidencia (mismo umbral que cobertura/reabastecimiento)
```
RPC `precio_referencia(p_comercio_id, p_proveedor_id, p_producto_id)`. Se decidió deliberadamente **excluir al propio comercio** de su cálculo (para que la referencia sea genuinamente "lo que pagan otros", coherente con el copy "Otros tenderos pagan ~$X").

**Uso — prellenado**: al abrir "poner precio" en un producto sin precio, si existe referencia, el campo se prellena con la mediana redondeada como valor inicial editable (nunca se sobreescribe un precio ya existente).

**Uso — chequeo de sanidad**: al guardar, si `|precio_tecleado − mediana| / mediana > 0.25` (constante `UMBRAL_DESVIACION_PRECIO`, `constants.js` de la app RN), se muestra una confirmación suave ("Otros tenderos le pagan aproximadamente $X, ¿confirmas $Y?") — nunca bloquea, en cualquiera de las dos direcciones (más caro o más barato). Implementado en `RelacionDetalleScreen.js` y `NuevoAbastecimientoScreen.js`.

### 10.3 Antigüedad de precio — `[NUEVO]`
`productos_relacion.precio_actualizado_en`, mantenida por un **trigger** (`fn_productos_relacion_precio_actualizado`, único trigger de todo el proyecto — el resto de la "automatización" vive en RPCs, no en triggers) que la pone en `now()` cuando `precio_pactado` cambia (en insert con precio, o en update con valor distinto). Aviso al tendero si pasan más de `UMBRAL_PRECIO_VIEJO_DIAS = 60` días sin actualizar.

### 10.4 Fricción de precio en "Pegar pedido" — gap ya identificado y luego resuelto parcialmente
`gaps-pendientes.md` (Prioridad 2, ítem #1) documentaba: "los productos creados desde Pegar Pedido nacen con `precio_pactado = null` y ese flujo no invita a ponerles precio ahí mismo". La construcción del "flujo de coincidencia" (sección 8.3) resuelve esto solo parcialmente: cuando el producto SÍ hace match con algo existente, se sigue sin capturar precio en ese momento (se linkea con `precio_pactado: null`, igual que antes). El "empujón tocable" que la misma doc proponía en Confirmar Pedido ("faltan N precios · ponlos ahora") **nunca se construyó**.

---

## 11. Unidades estandarizadas `[NUEVO — el diseño existía pausado, se retomó y extendió]`

`docs/catalogo-matching-unidades.md` diseñaba esto desde antes, con implementación "pausada explícitamente" según su propio encabezado — se retomó en esta última ronda de trabajo:

- `productos_maestro.unidad_base` (`unidad`/`kg`/`litro`, check constraint) — para cálculo interno (motor de reabastecimiento, precio unitario).
- `productos_relacion.factor_conversion` (numeric) — cuántas `unidad_base` trae la presentación de esa relación específica (ej. "Caja x24" con `unidad_base=unidad` → `factor_conversion=24`).
- `productos_relacion.unidad_pedido` (`[NUEVO, no estaba en el diseño original pausado]`) — cómo el tendero elige comprar en la UI ("caja", "bulto", "canasta"...), distinto de `unidad_base`. El diseño original solo hablaba de `presentacion`/`factor_conversion`; `unidad_pedido` se agregó porque se detectó que mostrar "2" sin unidad en el stepper de `NuevoAbastecimientoScreen.js` era ambiguo — el stepper ahora muestra "2 cajas" (pluralización con diccionario fijo + fallback naive `+s`).
- **Precio unitario implícito** (`[NUEVO]`): `precio_pactado / factor_conversion`, mostrado junto al precio cuando `factor_conversion > 1` (ej. "$50.000 ($2.083/unidad)") — no estaba en ningún documento, ni siquiera en el diseño pausado.

---

## 12. Abastecimientos y Pedidos — estados

### 12.1 Estados visibles al tendero: 3 `[SIN CAMBIOS]`
`Procesando / Confirmado / Entregado` — respetado sin excepción en toda la UI del tendero (`SeguimientoScreen.js`, `PedidosTabScreen.js`).

### 12.2 Estados internos: 6 documentados, 2 reales implementados `[MODIFICADO]`
El documento (Arquitectura y Decisiones Técnicas §13, Compi Book §10) especifica 6 estados internos: **Pendiente, Enviado, Recibido, Confirmado, Despachado, Entregado**. La implementación real tiene solo:
- `abastecimientos.estado`: `procesando → confirmado → entregado` (3 valores).
- `pedidos.estado`: `pendiente → confirmado → entregado` (3 valores — nótese que usa una palabra distinta a nivel de tabla para el primer estado que `abastecimientos`, ya documentado como advertencia explícita en `arquitectura.md`: "`pedidos` NO tiene el estado `procesando`" — es una inconsistencia de vocabulario **entre las dos tablas del propio sistema implementado**, no solo contra el documento).

Los 6 estados granulares ("Enviado", "Recibido", "Despachado") descritos en el documento **nunca se implementaron** — son exactamente los estados que un agente de WhatsApp real necesitaría para trackear el ciclo de vida de un mensaje/confirmación, y como ese agente no existe (sección 6), tampoco existió la necesidad real de esa granularidad. Este es un caso donde una brecha "arrastra" a otra: la ausencia del agente conversacional hizo innecesaria la complejidad de estados que el documento anticipaba para soportarlo.

### 12.3 Agregación de estado en el panel admin `[NUEVO, no documentado]`
`calcularEstadoGeneral` en `PedidosOperacion.jsx` (cliente, no RPC — ver sección 2): todos los pedidos `entregado` → abastecimiento `entregado`; todos `confirmado` o `entregado` (sin ningún `pendiente`) → `confirmado`; cualquier otra mezcla → `procesando`. Regla de agregación no especificada en ningún documento, inventada durante la construcción del panel admin.

---

## 13. Eliminar/soft-delete de proveedor `[NUEVO, no documentado]`
Ningún documento contempla qué pasa cuando un tendero quiere dejar de comprarle a un proveedor. Implementado con una regla de dos caminos, inventada durante la construcción:
- **Con historial de pedidos**: soft-delete (`relaciones.activo = false`), conserva todo el historial, reversible (re-agregar reactiva la misma relación en vez de duplicar, sección 8.2).
- **Sin historial**: hard-delete (`DELETE`), con fallback a soft-delete si el `DELETE` falla por una condición de carrera (un pedido se crea entre el chequeo y el borrado).

---

## 14. Identidad visual — RN vs. admin-web

### 14.1 App del tendero (React Native) `[SIN CAMBIOS, coincide exactamente con Identidad Visual v2]`
`theme.js` reproduce la paleta de `Identidad Visual Compi v2` valor por valor:

| Rol documentado | Hex documentado | Constante en `theme.js` |
|---|---|---|
| Teal Compi (primario) | `#0E7C86` | `COLORS.primary` |
| Teal Noche (estructura) | `#0A3D42` | `COLORS.primaryDark` / `COLORS.text` |
| Coral (acento cálido) | `#FF8A5B` | `COLORS.accent` |
| Fondo cálido-frío | `#F2F8F8` | `COLORS.bg` |
| Texto secundario | `#6B6459` | `COLORS.textSecondary` |
| Verde éxito | `#2E7D5B` | `COLORS.success` |
| Ámbar de alerta | `#854F0B` sobre `#FAEEDA` | `COLORS.warning` / `COLORS.warningBg` |
| Rojo | `#A32D2D` | `COLORS.error` |

Coincidencia exacta en los 8 valores. Tipografía (Inter/Manrope o Plus Jakarta Sans) — **no verificado en este reporte**: no inspeccioné configuración de fuentes de Expo en esta pasada; queda fuera del alcance de "solo código de negocio" salvo que se pida explícitamente revisar `app.json`/assets de fuentes.

**Nota importante**: el propio Compi Book v2 (Parte I) describe la paleta VIEJA ("verde Compi, azul profundo #1F3A5F") que `Identidad Visual v2` reemplaza explícitamente. La implementación sigue a `Identidad Visual v2` (la fuente correcta y más reciente), no al texto desactualizado dentro del Compi Book — mencionado aquí solo para que quede explícito que no es una desviación del código, es una inconsistencia interna no resuelta entre los propios documentos.

### 14.2 Panel de administración `[NUEVO, sin ningún documento de referencia]`
`apps/admin-web/` usa una identidad visual completamente distinta y no documentada en ningún lugar: fondo negro/casi negro, acento rojo (`#ff2e2e`, no confundir con el rojo de error `#A32D2D` de la app RN — son colores de marca vs. de estado, deliberadamente distintos entre sí), tipografía monoespaciada para números (`ui-monospace`/`SF Mono`/`JetBrains Mono`), estética inspirada explícitamente en "Nothing OS" (nombre de la referencia de diseño usada durante la construcción, no un término de ningún documento del proyecto). Ningún documento original anticipa ni sugiere una identidad visual separada para el panel admin — de hecho `Identidad Visual v2` se declara explícitamente aplicable a "React Native / Expo", sin mencionar el panel web en absoluto. Es una decisión de diseño tomada completamente fuera del alcance de los documentos disponibles.

---

## 15. Indicadores estratégicos y Dashboard admin `[NUEVO en su gran mayoría]`

Ningún documento original especifica un dashboard más allá de "curaduría y métricas" en términos generales, y la única métrica nombrada explícitamente es el IDC. Todo lo construido en `apps/admin-web/src/screens/Dashboard.jsx`, `AdopcionRetencion.jsx` y `SaludRed.jsx` se diseñó sin una especificación previa — `docs/indicadores-dashboard.md` es el único documento de diseño, y es interno a este repo, sin equivalente en el Compi Book.

### 15.1 IDC — el cambio de fórmula más importante de todo el reporte `[MODIFICADO deliberadamente]`

**Documentado** (Compi Book §5, Estrategia y Fundamentos §8): "el % del abastecimiento de un comercio específico que pasa por Compi. Si un tendero compra a 12 proveedores y 8 pasan por Compi, su IDC es 66%" — es decir, un **porcentaje calculado por comercio individual**, con `proveedores_totales` (autodeclarado) como denominador de esa división.

**Implementado hoy** (`admin_stats_estrategicos()`, migración 0018): un **número absoluto agregado de toda la red**:
```
idc_gestionados_total = Σ (relaciones activas por comercio), solo comercios con proveedores_totales > 0
idc_proveedores_totales_total = Σ (proveedores_totales autodeclarados), mismo filtro
```
`idc_proveedores_totales_total` se muestra únicamente como **contexto**, nunca como denominador de ninguna división. El desglose por comercio (`admin_idc_por_comercio()`) tampoco calcula porcentaje — muestra `gestionados` y `proveedores_totales` lado a lado, sin dividir.

**Por qué cambió** (razonamiento explícito capturado en `docs/indicadores-dashboard.md`, a pedido directo durante esta construcción): `proveedores_totales` se captura una sola vez, al registrarse, como estimación de memoria — no hay ningún límite que impida que el mismo tendero después agregue más proveedores reales de los que originalmente declaró, así que el porcentaje puede superar el 100% y volverse engañoso como número de negocio. La corrección fue deliberada y documentada, no un descuido — pero es, sin ambigüedad, una desviación de la definición original del North Star Metric tal como está escrita en los tres documentos de negocio. Si se quiere el porcentaje por-comercio tal como lo define el Compi Book, hoy solo es reconstruible a mano dividiendo las dos columnas de `admin_idc_por_comercio()` fila por fila — no existe como campo calculado en ningún punto del sistema.

### 15.2 Adopción y retención `[NUEVO]`
- **Comercios activos por semana/mes**: `admin_comercios_activos_tendencia(p_granularidad)`, 12 periodos hacia atrás, comercio "activo" = al menos 1 `abastecimiento` en el periodo.
- **Tiempo a primer pedido**: `admin_tiempo_a_primer_pedido()` — promedio y mediana de días entre `comercios.created_at` y el primer `abastecimientos.fecha`, solo comercios con ≥1 pedido.
- **Cohortes de retención**: `admin_cohortes_retencion()` — cohortes mensuales por `created_at`, retención a 30/60/90 días = % del cohorte con un abastecimiento en/después de `created_at + N días`; **`null` explícito (no 0%) cuando el cohorte todavía no cumple esa edad** — decisión deliberada de esta construcción para no mostrar un dato falso mientras no es medible todavía.
- **Abandono de onboarding**: `admin_onboarding_abandono()` — "abandonado" = comercio sin ninguna fila en `proveedores_sugeridos` **y** sin ninguna fila en `abastecimientos` (nunca intentó nada, ni siquiera agregar un proveedor).

### 15.3 Salud de la red `[NUEVO]`
- **Efecto de red** (`admin_efecto_red()`): ver sección 1.4.
- **Densidad por barrio** (`admin_densidad_por_barrio()`): comercios activos agrupados por `coalesce(barrio, 'Sin barrio')`.
- **Señales negativas por proveedor** (`admin_senales_negativas_por_proveedor()`): conteo de `cobertura_senales_negativas` por proveedor, alerta visual si `total >= UMBRAL_ALERTA_SENALES_NEGATIVAS = 3` (constante independiente del umbral de curaduría, deliberadamente — no comparten valor por diseño aunque hoy coincidan en 3).

### 15.4 Embudo y salud del motor de reabastecimiento `[NUEVO]`
`embudo_creados_30d`/`embudo_entregados_30d` (últimos 30 días); `reab_pendiente_30d`/`reab_aceptada_30d`/`reab_pospuesta_30d`/`reab_ignorada_30d` — desglose de `reabastecimiento_sugerencias.respuesta` de los últimos 30 días. Ninguno de estos indicadores está descrito en ningún documento original.

---

## 16. Edge Function `ai-proxy` — arquitectura de seguridad de IA `[SIN CAMBIOS respecto al principio, MODIFICADO/ampliado en el detalle]`

"La key de Anthropic nunca en el bundle del cliente... toda llamada a un servicio externo con key sensible pasa por una Edge Function" — `[SIN CAMBIOS]`, verificado: `ANTHROPIC_API_KEY` solo se lee vía `Deno.env.get()` dentro de `supabase/functions/ai-proxy/index.ts`, nunca en ningún archivo del cliente RN ni en `apps/admin-web/`.

Modelo usado: `claude-sonnet-4-6` — coincide con lo confirmado en `CLAUDE.md` como decisión vigente.

**Acciones soportadas** (`[NUEVO respecto al detalle, no estaba especificado a este nivel]`):
- `detectar-proveedores` (sección 5.1).
- `extraer-productos` (sección 5.2), ahora también adjunta `coincidencia` (mejor match por similitud, sección 8.3) a cada producto extraído — capa añadida sobre la especificación original del "motor de importación", que solo pedía "convertir texto en catálogo estructurado", no matching contra el catálogo existente en el mismo paso.

**`verify_jwt` activo** (`arquitectura.md`: "salvo razón explícita") — no verificado directamente en este reporte (es configuración de plataforma en el dashboard de Supabase, no algo visible en el código versionado); se marca como no verificado, no como confirmado.

---

## 17. `admin_audit_log` `[NUEVO]`

Ningún documento pide un log de auditoría. Se construyó porque "hoy solo hay un admin, pero en cuanto haya un segundo... se necesita saber quién hizo qué y cuándo" (razonamiento capturado en esta misma construcción, no en ningún documento previo). Instrumenta las 8 RPCs de aprobación/rechazo de curaduría (proveedores, productos, cambios de número de proveedor, cambios de comercio) — `admin_user_id, accion, tabla_afectada, registro_id, detalle (jsonb)`. Solo escribible por esas RPCs (`security definer`), solo legible por `is_admin()`. Sin pantalla de lectura en el panel — se consulta hoy por SQL Editor.

---

## 18. Seguridad — RLS, más allá del principio general

Cubierto en detalle en la auditoría de migraciones ya hecha en esta conversación (no se repite aquí completo). Puntos que valen mención explícita en un reporte contra documentos originales:

- El documento nunca especifica RLS como mecanismo — la decisión de que "la defensa debe vivir en Postgres (RLS), no en la UI" es de `docs/gap2-plan-roles-rls.md`, íntegramente `[NUEVO]` respecto a los 4 documentos de negocio/producto.
- Un caso real de política asimétrica que vale la pena señalar por si es una sorpresa: en `cobertura_senales_negativas`, un tendero puede **insertar** una señal pero **no puede leerla de vuelta** (solo `is_admin()` tiene `SELECT`) — coherente con que es una señal "para Compi", no un dato del tendero, pero es una asimetría no explicitada en ningún documento y que sorprendería a quien asuma que "lo que yo reporto, yo lo puedo ver".

---

## 19. Brechas inversas — lo documentado que sigue sin implementarse en absoluto

Consolidado de todas las secciones anteriores, para tenerlo en un solo lugar:

### 19.1 Brecha crítica — el agente conversacional de WhatsApp (0% construido)
La pieza #5 del núcleo, la que sostiene toda la promesa de "sin operador humano" del Compi Book Parte III. No hay integración con WhatsApp Business API, no hay agente, no hay interpretación de texto libre de proveedores, no hay reintentos automáticos. **Consecuencia directa**: el único mecanismo para avanzar el estado de un pedido hoy es un humano de Compi haciendo clic en el panel admin — exactamente lo que el documento dice que el panel admin no debe ser ("no operación... no se confirman pedidos a mano aquí"). Ver sección 6.

### 19.2 Trámite con Meta (WhatsApp Business API)
Documentado como "la dependencia externa con el tiempo de espera más largo... debe iniciarse el día 1" — no hay ninguna evidencia en el código de que este trámite haya avanzado (sin webhook, sin plantillas de mensaje, sin número dedicado configurado en ningún secreto/config del proyecto).

### 19.3 Pedido sugerido con inteligencia (distinto del Motor de Reabastecimiento Predictivo)
El documento distingue explícitamente dos capacidades de Fase 3: "repetir pedido" (implementado, MVP) y "pedido sugerido con inteligencia" (arma una propuesta completa de abastecimiento con IA, usando historial). Solo se implementó el Motor de Reabastecimiento Predictivo (detecta la señal de UN producto) — la capacidad de que la IA arme un abastecimiento completo sugerido (varios productos, de varios proveedores, a la vez) no existe.

### 19.4 Plantillas de catálogo semilla por tipo de negocio
Tercera fuente del onboarding inteligente. No implementada (sección 5.3).

### 19.5 Pantalla de Notificaciones (#24 del documento)
No existe ningún archivo `NotificacionesScreen.js` ni equivalente. No hay lista cronológica de confirmaciones/ajustes/entregas en ningún punto de la app.

### 19.6 Pantalla "Ajuste del proveedor" (#16)
Depende enteramente del agente de WhatsApp (19.1) — no existe.

### 19.7 "Todavía tengo" como tercera respuesta del reabastecimiento predictivo
El documento especifica dos caminos de respuesta con lógica de recalibración distinta cada uno; solo un camino ("ya lo compré") está construido. Ver sección 7.3.

### 19.8 Recalibración empírica del multiplicador 1.3x
Los datos para hacerlo se capturan desde el día 1 (`reabastecimiento_sugerencias`), pero no existe ningún proceso que los use — el sistema sigue con `1.3` fijo. Ver sección 7.3.

### 19.9 "Verdad de campo" del motor de reabastecimiento (`compra_confirmada_en`)
Columna preparada, nunca poblada — falta el job/trigger que ligue una compra real posterior a la sugerencia pendiente más reciente. Documentado en el propio `docs/reabastecimiento-predictivo.md` como "PR-C, fuera del alcance del primer PR" — sigue fuera de alcance.

### 19.10 Notificaciones push
Sin infraestructura (ni Expo Push Tokens, ni manejo de permisos). El Motor de Reabastecimiento Predictivo depende conceptualmente de esto para la entrega "agrupada por comercio" proactiva — hoy solo se ve si el tendero abre la app.

### 19.11 Fusionar duplicados (tarea de curaduría #3 de 4)
No existe como herramienta explícita en el panel admin. Ver sección 8.4.

### 19.12 Revisar calidad de promociones (tarea de curaduría #4 de 4, y todo el concepto de "promociones")
El concepto de "promoción" no existe en ningún punto del esquema ni de ninguna pantalla — ni tabla, ni RPC, ni UI. Es una ausencia total, no una implementación parcial.

### 19.13 Panel del proveedor (nivel "Compi") y API/ERP (nivel "Enterprise")
Documentado como Fase 3/4, correctamente no implementado — se preparó el campo `nivel_servicio` en el esquema (sección 3) pero ningún canal real existe detrás de `compi` ni `enterprise`.

### 19.14 Reportar problema (pantalla #20, detalle de pedido entregado)
No existe ningún mecanismo de reporte de problema post-entrega en ninguna pantalla.

### 19.15 Reenvío de OTP con temporizador (pantalla #4)
El documento especifica "4 casillas de código, reenvío con temporizador". La implementación (`VerificacionScreen.js`) usa 1 campo de texto de 6 dígitos (no 4 casillas — además el número de dígitos cambió de 4 a 6), y no tiene ningún botón ni temporizador de reenvío — si el código no llega, la única opción es volver atrás a Login y reenviar desde ahí.

### 19.16 Onboarding de 3 slides explicativos antes de Login (pantalla #2)
No existe como pantalla — el stack de navegación va directo de `Splash` a `Login`, sin ningún carrusel explicativo intermedio.

### 19.17 Backfill de `lat`/`lng` para comercios antiguos
Documentado como pendiente en `gaps-pendientes.md`, sigue pendiente — comercios registrados antes de la migración 0009 siguen sin coordenadas salvo edición manual.

### 19.18 Términos de uso / política de privacidad
Sin redactar, sin pantalla de aceptación — el esquema ya tiene `comercios.terminos_aceptados_en`/`terminos_version` preparados (sección 4), pero es exactamente eso, preparación sin uso todavía. Relevante porque `ImportarContactosScreen.js` ya envía nombres reales de terceros a la API de Anthropic sin que exista ningún término de uso que lo respalde.

### 19.19 Tiempo promedio por abastecimiento (<2 min) como KPI medido
No hay ninguna instrumentación de tiempo-en-flujo en ningún punto de la app — el KPI está definido en el documento pero no hay ningún dato que lo alimente.

### 19.20 Costo por abastecimiento
"El indicador de costos más importante" según Estrategia y Fundamentos §10 — no hay ningún tracking de costo de IA (Anthropic) ni de mensajería (WhatsApp/Twilio) en ningún punto del sistema. Ya identificado como Prioridad 2 en `docs/indicadores-dashboard.md`, sigue sin construirse.

### 19.21 Barrios digitalizados como métrica pública de negocio
Ver sección 1.7 — existe un primo cercano (`admin_densidad_por_barrio`) pero no el concepto específico documentado.

---

## Resumen ejecutivo de etiquetas (conteo aproximado por sección temática)

- **Modelo de datos de 3 capas, curaduría, catálogo maestro**: mayoritariamente `[SIN CAMBIOS]` — es la parte del proyecto más fielmente construida contra el documento.
- **Motor de Reabastecimiento Predictivo**: núcleo matemático `[SIN CAMBIOS]`, instrumentación y un camino de respuesta `[NUEVO]`/`[NO IMPLEMENTADO]` respectivamente.
- **Motor de Enrutamiento / agente WhatsApp**: `[NO IMPLEMENTADO]` en su totalidad — es la brecha más grande de todo el proyecto.
- **Motor de Cobertura de Proveedores**: `[NUEVO]` al 100%, sin ningún antecedente documental.
- **Precio de referencia, unidades estandarizadas, matching por similitud**: `[NUEVO]` en el mecanismo, sobre objetivos que sí estaban documentados en términos generales.
- **Panel de administración completo**: `[NUEVO]` en casi la totalidad de sus pantallas concretas — el documento original nunca especificó pantallas de admin (solo lo hizo para la app del tendero, con 29 pantallas detalladas).
- **Indicadores estratégicos / Dashboard**: `[NUEVO]` casi al 100%, salvo el IDC, que además está `[MODIFICADO]` en su fórmula.
- **Identidad visual**: `[SIN CAMBIOS]` en la app RN (coincide exactamente con Identidad Visual v2), `[NUEVO]` sin ningún documento de referencia en el panel admin.
