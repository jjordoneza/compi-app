# Curaduría por coincidencia + estandarización de unidades — diseño

**Estado**: diseño aprobado, implementación pendiente (no incluida en Fase 3 de
gap #2 — es una mejora de seguimiento que reduce cuánto se usa la cola de
curaduría, no un prerequisito para activarla).

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
   — nunca adivina. Mejor una aprobación de más que un match falso.
2. Con `unidad_base` no nulo, el proxy llama `buscar_producto_similar` (anon
   key — `productos_maestro` es de lectura pública bajo Fase 3) y adjunta la
   mejor coincidencia si supera el umbral.

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

## Relación con Fase 3

No bloquea la activación de RLS/colas de curaduría (gap #2 Fase 3): esa fase
implementa el redirect a `*_sugeridos` tal como estaba diseñado (todo lo
genuinamente nuevo va a la cola). Este diseño es la mejora de seguimiento que
reduce cuánto se usa esa cola una vez implementada.
