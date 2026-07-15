# CLAUDE.md

Contexto esencial de **Compi**. Detalle completo en `docs/producto.md`,
`docs/arquitectura.md`, `docs/pantallas.md` — léelos cuando una tarea toque
reglas de negocio o diseño de pantallas.

## Qué es Compi
App de **abastecimiento para tenderos** de tienda de barrio en Colombia: resurtir
desde varios proveedores con la mínima fricción. Hace pocas cosas muy bien —
**no** es un CRM, ni inventario, ni "app para administrar todo el negocio". Ante
una feature nueva: ¿ayuda a resurtir más rápido? Si no, no va.

## Stack
- **Frontend**: Expo / React Native (iOS + Android, un solo código). Sin lógica de
  negocio en el cliente: arma, envía y muestra el estado de un abastecimiento.
- **Backend**: Supabase (Postgres). Se accede por **REST directo con `fetch`**
  (ver `supabase.js`). **NO usar el SDK `supabase-js`** — rompe con Hermes en el
  entorno donde nació el proyecto.
- **IA**: Claude (`claude-sonnet-4-6`) **solo vía la Edge Function `ai-proxy`**,
  nunca directo desde el cliente.
- **Build**: EAS (`preview` = APK instalable, `production` = Play Store). Todo se
  gestiona desde dashboards web — **sin CLI local** (restricción del entorno).

## Arquitectura: un núcleo, tres ventanas
La lógica vive en **un solo lugar** (backend/Supabase). Las interfaces (app del
tendero, panel admin web, canal del proveedor) solo muestran y capturan. Nunca
dupliques lógica de negocio en una interfaz — va en el núcleo.

## Modelo de datos de tres capas — la regla más importante
**El producto es global; el precio vive en la relación.**
- `proveedores_maestro` — proveedor **global y único** (una tienda nueva se vincula
  al existente, no crea duplicado).
- `productos_maestro` — SKU **global** ("Gaseosa 1.5L" existe una sola vez).
- `relaciones` — vínculo comercio↔proveedor; aquí viven **precios pactados**, días
  de pedido y mínimos.
- `productos_relacion` — instancia de un producto maestro **con el precio de esa
  relación**. Un mismo SKU tiene tantos precios como relaciones lo incluyan.
- **El precio NUNCA se guarda en `productos_maestro`.** Al mostrar o calcular
  precios, léelos siempre de `productos_relacion` / la relación.

Otras tablas: `comercios` (tienda; incluye `proveedores_totales`, denominador del
IDC), `abastecimientos`, `pedidos`, `pedido_items`,
`sugerencias_cambio_proveedor`, `reabastecimiento_ajustes` (Fase 3).

**Abastecimiento vs Pedido**: el *abastecimiento* es el acto completo de resurtir
(lo que el tendero manipula); se divide en *pedidos*, uno por proveedor.

**Cascade deletes**: `relaciones → comercios`, `productos_relacion → relaciones`.

## Estados de pedido
- `abastecimientos.estado`: `procesando → confirmado → entregado`.
- `pedidos.estado`: `pendiente → confirmado → entregado`.
- ⚠️ **`pedidos` NO tiene `procesando`.** No copies estados 1:1 entre las dos
  tablas sin verificar los valores válidos de cada una.
- El tendero ve **solo 3 estados** (Procesando / Confirmado / Entregado).
  Cualquier granularidad interna extra **nunca** se expone en la UI del tendero.

## Reglas de negocio no negociables
1. **Los tenderos no modifican proveedores directamente.** Producto nuevo que no
   está en el catálogo maestro, corrección de datos, fusión de duplicados → van a
   una **cola de curaduría en el panel admin**. Nunca se crea/modifica automático
   desde la app del tendero.
2. **"Repetir pedido" es el héroe del MVP**, no el pedido sugerido con IA. Repetir
   funciona desde el pedido #2 y cubre 70-80% de las compras.
3. **Motor de Reabastecimiento Predictivo = Fase 3, no MVP.** Cuando se implemente:
   - Mínimo **3 compras históricas** de un producto antes de sugerir nada.
   - Multiplicador **1.3x** sobre la cadencia promedio de compra.
   - **Una sugerencia a la vez**, nunca una lista.
   - Notificaciones agrupadas **por comercio**, nunca por producto (evita spam).
4. **La key de Anthropic (y cualquier secreto) nunca en el bundle del cliente.**
   Expo empaqueta hasta los `.env` del cliente. Todo servicio con key sensible
   pasa por una **Edge Function** que lee el secreto con `Deno.env.get(...)`. Las
   Edge Functions van con **`verify_jwt` activo** salvo razón explícita.
5. **Onboarding sin operador humano**, combinando: importar contactos (tap para
   marcar proveedores), pegar pedido viejo de WhatsApp (un LLM lo convierte en
   catálogo), y plantillas semilla. Debe cubrir **más de un proveedor** con un loop
   breve y siempre abandonable ("Terminar por ahora").

## Patrones de UX (toda pantalla nueva)
- **Un solo héroe por pantalla** — una única acción principal dominante.
- Bottom nav de **3 tabs**: Inicio / Pedidos / Proveedores. El perfil va en el
  header, no en el bottom nav.
- Áreas táctiles mínimas **48px** (incluidos los botones +/- de cantidad).
- Máximo **3 datos por producto** en listas.
- Precios visibles por producto **y** como total estimado antes de confirmar.
- Errores y estados vacíos como acompañamiento ("tranquilo, nosotros lo
  resolvemos"), nunca como error técnico frío.
- El Home **nunca inventa una sugerencia sin historial real** — sin datos, ofrece
  honestamente "empezar", no una sugerencia fabricada.

## Al escribir código
- Consultas nuevas a Supabase: seguir el patrón de `fetch` de `supabase.js`.
- Funciones de IA: extender `ai-proxy` (`supabase/functions/ai-proxy/index.ts`) +
  `ai.js`, no llamar a Anthropic desde una pantalla.
- Los nombres de pantalla en `docs/pantallas.md` son conceptuales; verifica el
  archivo real en `screens/` / `screens/tendero/` antes de asumir correspondencia.
- Modelo de IA confirmado: `claude-sonnet-4-6` — no cambiar sin pedirlo.
