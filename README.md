# Compi

App móvil (Expo / React Native) para tenderos colombianos. Ayuda al dueño de una
tienda de barrio a registrar su negocio, identificar cuáles de sus contactos son
proveedores, administrar un catálogo de productos y hacer pedidos de
reabastecimiento con seguimiento de estado.

## Stack

- **Expo** SDK 54 / React Native 0.81 (New Architecture habilitada)
- **React Navigation** (native stack + bottom tabs)
- **Supabase** como backend (base de datos vía la API REST de PostgREST)
- **Anthropic (Claude)** para las funciones de IA, expuesto a través de una
  **Supabase Edge Function** (la app nunca llama a Anthropic directamente)

## Arquitectura

```
App.js                      Stack de navegación raíz
  └─ screens/tendero/TabNavigator.js   Tabs: Inicio · Pedidos · Proveedores · Perfil
screens/                    Pantallas del flujo (registro, catálogo, pedidos, etc.)
supabase.js                 Cliente REST de Supabase (tablas y consultas)
ai.js                       Cliente de las funciones de IA → llama a la Edge Function
theme.js                    Colores, radios y helpers de formato
supabase/functions/ai-proxy Edge Function que reenvía a la API de Anthropic
```

### Datos (Supabase)

Tablas principales usadas por `supabase.js`: `comercios`, `proveedores_maestro`,
`relaciones`, `productos_maestro`, `productos_relacion`, `abastecimientos`,
`pedidos`, `pedido_items`, `sugerencias_cambio_proveedor`,
`reabastecimiento_ajustes`.

Relación de un pedido: `pedido_items.pedido_id → pedidos.id`,
`pedidos.abastecimiento_id → abastecimientos.id`,
`abastecimientos.comercio_id → comercios.id`.

Estados: un `abastecimiento` pasa por `procesando → confirmado → entregado`; cada
`pedido` individual por `pendiente → confirmado → entregado`.

### IA vía Edge Function

`ai.js` expone `detectarProveedores(nombres)` y
`extraerProductosDePedido(texto)`. Ambas llaman a la Edge Function `ai-proxy`
(`supabase/functions/ai-proxy/index.ts`) enviando `{ accion, ... }`. La función
lee la clave de Anthropic desde el secreto `ANTHROPIC_API_KEY` de Supabase y
reenvía la petición, de modo que **la clave nunca se empaqueta en el bundle del
celular**.

## Puesta en marcha (desarrollo)

```bash
npm install
npm start        # abre el dev server de Expo (o: npm run android / ios / web)
```

`supabase.js` incluye la URL del proyecto y la `anon key` (pública, protegida por
las políticas RLS de Supabase). No hace falta configurar variables de entorno en
el cliente.

### Edge Function `ai-proxy`

El código vive en `supabase/functions/ai-proxy/index.ts`. Para desplegarla desde
el dashboard de Supabase (Edge Functions):

1. Crea una función con el nombre exacto **`ai-proxy`** y pega el contenido de
   `index.ts`.
2. En **Settings → Edge Functions → Secrets**, define `ANTHROPIC_API_KEY` con tu
   clave de Anthropic.
3. Deja `verify_jwt` activo (la app envía la `anon key` en el header
   `Authorization`).

## Builds (EAS)

La configuración está en `eas.json` y el proyecto está enlazado en `app.json`
(`extra.eas.projectId`, slug `compi`, owner `jj-tecnologia-sas`). Perfiles:

- **preview** → genera un `.apk` instalable directo (sideload), distribución interna.
- **production** → app bundle para tienda, con versionado remoto autoincremental.

Puedes lanzar los builds desde el dashboard de expo.dev sin CLI local.
