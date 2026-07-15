# Compi — Arquitectura técnica

## Regla central
Compi no son tres apps que se integran. Es **un núcleo central con tres ventanas hacia él**. La lógica de negocio vive en un solo lugar (el backend/Supabase); las interfaces solo muestran y capturan datos. Pensar en "tres sistemas que sincronizar" es el error a evitar — siempre que se agregue una feature, la lógica va en el núcleo, no duplicada en cada interfaz.

## Las tres interfaces
1. **App del tendero** (Expo/React Native, iOS + Android desde un solo código) — sin lógica de negocio propia, solo arma, envía y muestra el estado de un abastecimiento.
2. **Panel de admin** (web) — curaduría y métricas, nunca operación tipo call center.
3. **Canal del proveedor** — WhatsApp con botones para la mayoría (nivel Personal, único que existe en el MVP); panel (nivel Compi) o API/ERP (nivel Enterprise) llegan después, cuando el volumen los justifique.

## Stack actual
- **Frontend**: Expo (React Native), actualmente en migración desde Expo Snack hacia un flujo de GitHub + EAS Build.
- **Backend**: Supabase — Postgres + REST directo vía `fetch` (NO usar el SDK `supabase-js`: causa fallos de polyfill con el motor Hermes en el entorno de Expo Snack donde se originó el proyecto; si se migra fuera de Snack, esto puede revisarse, pero por ahora seguir con `fetch` directo para consistencia).
- **IA**: API de Claude (`claude-sonnet-4-6`), llamada **exclusivamente desde una Supabase Edge Function** (`ai-proxy`), nunca directo desde el cliente — la key de Anthropic vive como secreto de servidor, nunca en código que corre en el celular.
- **Build/deploy**: EAS Build (perfil `preview` para APK instalable de pruebas, `production` para Play Store), conectado al repo de GitHub. Sin CLI local (restricción de entorno del desarrollador) — todo se gestiona desde los dashboards web (Supabase, expo.dev, GitHub, claude.ai/code).

## Modelo de datos: tres capas
Ver `producto.md` para el detalle de negocio. En términos de esquema:
- `comercios` — la tienda/tendero.
- `proveedores_maestro` — proveedor global y único.
- `relaciones` — vínculo comercio↔proveedor (aquí viven precios pactados, días de pedido, mínimos).
- `productos_maestro` — SKU global.
- `productos_relacion` — instancia de un producto con el precio de una relación específica.
- `abastecimientos` — el acto completo de resurtir (estado, fecha, comercio_id).
- `pedidos` — cada trozo de un abastecimiento dirigido a un proveedor (estado, abastecimiento_id, relacion_id).
- `pedido_items` — línea de detalle de un pedido.
- `sugerencias_cambio_proveedor`, `reabastecimiento_ajustes` — soporte para Fase 3.

**Cascade deletes configurados en**: `relaciones → comercios` y `productos_relacion → relaciones`.

**Estados**:
- `abastecimientos.estado`: `procesando` → `confirmado` → `entregado`.
- `pedidos.estado`: `pendiente` → `confirmado` → `entregado` (nota: `pedidos` NO tiene el estado `procesando` — no copiar estados 1:1 entre estas dos tablas sin verificar los valores válidos de cada una).

## El viaje de un abastecimiento (sin operador humano)
1. El tendero confirma un abastecimiento en la app.
2. El motor de enrutamiento lo divide en pedidos, uno por proveedor.
3. El agente envía a cada proveedor un WhatsApp con botones (Confirmar / Con cambios / No puedo).
4. Confirmación con botón → estado se actualiza solo. Respuesta en texto libre → un LLM interpreta el ajuste, actualiza el pedido, y notifica al tendero para aprobar/rechazar.
5. Si no responde tras reintentos automáticos → el control regresa al tendero, nunca a un operador de Compi.

## WhatsApp Business API (dependencia externa crítica)
Es la dependencia con el tiempo de espera más largo y menos control del equipo — debe iniciarse el día 1 en paralelo con todo lo demás:
1. Cuenta de Meta Business (business.facebook.com) con datos legales de la empresa.
2. Verificación de negocio (el paso más lento — de días a semanas).
3. Registrar un número dedicado (no puede ser un número que ya use WhatsApp normal o Business app).
4. Elegir conexión directa con Meta, o vía un BSP (Twilio, 360dialog, Gupshup) para arrancar más rápido.
5. Crear y enviar a aprobación las plantillas de mensajes (pedido, recordatorio, confirmación).
6. Modelar el costo por conversación iniciada dentro del costo por abastecimiento.
7. Respetar la ventana de 24 horas: una vez el proveedor responde hay 24h para mensajes libres; fuera de esa ventana solo se puede reabrir con una plantilla aprobada.

## Seguridad — decisiones ya tomadas
- Ninguna API key de terceros (Anthropic, etc.) debe vivir en código que se empaqueta en el bundle del cliente (Expo empaqueta cualquier variable de entorno del lado del cliente en el bundle que corre en el celular — un `.env` del lado del cliente NO protege la key).
- Cualquier llamada a un servicio externo con key sensible pasa por una Edge Function de Supabase, que guarda el secreto en `Deno.env.get(...)` del lado del servidor.
- Las funciones Edge se dejan con `verify_jwt` activo (requieren el header `Authorization: Bearer <anon-key>` que la app ya envía) salvo razón explícita para desactivarlo.
