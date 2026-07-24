# Curaduría por coincidencia + estandarización de unidades — diseño

**Estado**: ✅ implementado (18-19 jul 2026, migraciones `0024`/`0025` +
`ai-proxy` + `PegarPedidoScreen`; completado 23 jul 2026 con la UI que
faltaba en `ImportarContactosScreen` — ver detalle abajo). Esta línea de
"Estado" había quedado desactualizada — la implementación real ya pasó,
solo nadie corrigió el encabezado del documento.

## Problema

La regla de negocio es clara: la cola de curaduría (`docs/gap2-plan-roles-rls.md`,
tablas `productos_sugeridos`/`proveedores_sugeridos`) debe usarse **solo** cuando
un producto/proveedor genuinamente no existe en Compi. Si ya existe (aunque con
variaciones de nombre, tamaño o presentación — "Coca-Cola 1.5L" vs "Coca Cola
1.5", "Bulto arroz Roa 50kg" vs "bulto de arroz"), no debe crearse una entrada
nueva: hay que encontrar la coincidencia y vincular (`productos_relacion`
apuntando al `producto_maestro` existente), sin pasar por aprobación de nadie —
es dato de la relación, no del catálogo compartido.

**Causa raíz de por qué hoy todo se crea como "nuevo":** `productos_maestro`
guarda la presentación como parte de la identidad del SKU global. Dos
proveedores que venden el mismo producto en empaques distintos (bulto de 50kg
vs. bolsa de 1kg) no pueden compartir una fila maestra sin cambiar esto — cada
proveedor termina forzando un producto "nuevo".

## 1. Cambios de esquema

- **`productos_maestro`**: nueva columna `unidad_base text check (unidad_base in
  ('unidad','kg','litro'))`, nullable (los productos existentes arrancan en
  `null`, se completan con el tiempo).
- **`productos_relacion`**: nuevas columnas `presentacion text` y
  `factor_conversion numeric`. **La presentación deja de ser del producto
  maestro y pasa a ser de la relación** — cada proveedor empaca a su manera.
  `productos_maestro.presentacion` (columna actual) queda como referencia
  legacy, no autoritativa; las pantallas migran a leer
  `productos_relacion.presentacion`.
- **Backfill**: los `productos_relacion` existentes heredan la `presentacion`
  del maestro al que apuntan; `factor_conversion` arranca en `1` (placeholder
  seguro, se corrige con el tiempo).

## 2. Búsqueda de coincidencias (el núcleo, en Postgres)

Dos RPCs con `pg_trgm` (similitud de texto) + filtro exacto por unidad:
- `buscar_producto_similar(p_nombre, p_unidad_base, p_umbral default 0.35)` →
  candidatos de `productos_maestro` con **misma `unidad_base`** y similitud de
  nombre por encima del umbral, ordenados por similitud desc.
- `buscar_proveedor_similar(p_nombre, p_umbral default 0.35)` → mismo patrón
  para `proveedores_maestro`, sin filtro de unidad.

Viven en la base para que cualquier flujo (ai-proxy, futuras pantallas admin)
las reutilice, en vez de duplicar lógica de fuzzy-matching en cada lugar.

## 3. Cambios en `ai-proxy`

**`extraer-productos`:**
1. El prompt pide, además de nombre/cantidad/presentación, `unidad_base` y
   `factor_conversion` normalizados (reglas: kg/g→kg, L/ml→litro, conteo→
   unidad). Si la presentación es ambigua, el LLM devuelve `unidad_base: null`
   — nunca adivina.
2. El proxy llama `buscar_producto_similar` (anon key — `productos_maestro` es
   de lectura pública bajo Fase 3) siempre, tenga o no `unidad_base` el ítem
   detectado, y adjunta la mejor coincidencia si supera el umbral de similitud
   de nombre. **Corregido 18 jul 2026**: la versión original solo llamaba a
   la RPC cuando `unidad_base` no era nulo — en la práctica el LLM lo deja en
   `null` con frecuencia (es conservador a propósito), así que casi ningún
   producto llegaba a mostrar la tarjeta de coincidencia y todo terminaba en
   curaduría. `buscar_producto_similar` ya tolera `unidad_base` nulo en
   cualquiera de los dos lados (ver su `where` en la migración 0025), así que
   el filtro de similitud de nombre (0.35) sigue siendo la única red de
   seguridad contra falsos positivos — no se perdió protección, solo se dejó
   de bloquear la búsqueda antes de intentarla.

**`detectar-proveedores`:** mismo patrón con `buscar_proveedor_similar`.

## 4. Qué ve el tendero

- **Coincidencia encontrada** (`PegarPedidoScreen` / `ImportarContactosScreen`):
  *"Ya lo tenemos: {nombre existente} — ¿es este?"* → **"Sí, es el mismo"**
  crea `productos_relacion`/`relaciones` apuntando directo al maestro
  existente, sin curaduría, inmediato. **"No, es distinto"** cae al camino de
  abajo.
- **Genuinamente nuevo**: *"Producto nuevo — se envía a revisión, no podrás
  pedirlo hasta que se apruebe"* — expectativa honesta de que no está
  disponible de inmediato.

**Nota de implementación (23 jul 2026)**: `PegarPedidoScreen` ya tenía este
patrón completo desde el 18-19 jul. `ImportarContactosScreen` en cambio solo
usaba `buscar_proveedor_similar` para clasificar contactos, pero descartaba
el campo `coincidencia` que `ai-proxy` ya calculaba — nunca se lo mostraba al
tendero. Se conectó: cada contacto seleccionado con `coincidencia` ahora
muestra la misma caja "Ya lo tenemos... ¿es este?" con Sí/No, y "Sí, es el
mismo" vincula directo a `proveedores_maestro` (reactivando la relación si
estaba desactivada, mismo patrón que `AgregarProveedorScreen`) sin pasar por
curaduría. El botón de guardar queda deshabilitado hasta que todas las
coincidencias detectadas se confirmen (igual que `PegarPedidoScreen`). No
reemplaza la auto-vinculación por celular (migración 0032) — esa sigue
corriendo primero de facto porque es más confiable (celular exacto); esta
confirmación por nombre solo aplica cuando el tendero la aprueba a mano.

## Relación con Fase 3

No bloquea la activación de RLS/colas de curaduría (gap #2 Fase 3): esa fase
implementa el redirect a `*_sugeridos` tal como estaba diseñado (todo lo
genuinamente nuevo va a la cola). Este diseño es la mejora de seguimiento que
reduce cuánto se usa esa cola una vez implementada.
