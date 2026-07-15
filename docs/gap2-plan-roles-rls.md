# Gap #2 — Separación de roles admin/tendero + RLS: plan de fases

Cierra el gap #2 de `docs/gaps-pendientes.md` (hoy no hay auth real: código demo
`1234` + anon key pública con acceso total; el panel admin es solo navegación en
la pestaña Perfil). La defensa debe vivir en **Postgres (RLS)**, no en la UI.

## Decisiones tomadas
- **Dos sistemas de auth** en el mismo proyecto Supabase: tenderos con **Phone Auth
  (OTP SMS vía Twilio)**; admins con **email + contraseña**.
- Rol decidido por Postgres con `auth.uid()`, nunca por el cliente. Una tabla
  `admins` explícita + helper `is_admin()`. Membresía tendero↔comercio en
  `comercio_miembros` + helper `es_miembro()`.
- **Cola de curaduría opción (b)**: tablas `proveedores_sugeridos` /
  `productos_sugeridos`. El tendero propone; el admin aprueba y recién ahí se crea
  la fila en el catálogo maestro compartido.
- **Panel admin como app web separada**, en **monorepo** (`apps/admin-web/`).
  Stack liviano: **Vite + React + supabase-js** (SPA estática, sin backend propio;
  RLS es la barrera). `supabase-js` sí se usa aquí — la regla de "no supabase-js"
  es solo del cliente RN (Hermes), no del navegador.
- **Sin proyecto de staging**: se va directo sobre el proyecto actual (no hay
  tenderos reales). Por eso cada migración peligrosa trae su **SQL de rollback**.

## Orden de fases (por qué RLS no puede ir primero)
Activar RLS en las tablas existentes **rompe la app actual** (depende de acceso
total con anon key). Solo es seguro después de que la app RN mande el token de
sesión del tendero. Por eso:

- **Fase 1 — Fundación (segura, aditiva).** `admins`, `comercio_miembros`, colas
  `*_sugeridos`, helpers `is_admin()`/`es_miembro()`, RPCs `crear_comercio` y
  `reclamar_comercios_por_telefono`. RLS solo en las tablas nuevas. **No** toca las
  existentes → la app sigue igual. → `supabase/migrations/0003_*` (+ rollback).
- **Fase 2 — Auth real en RN.** Phone Auth (OTP Twilio); `supabase.js` pasa a
  mandar el `access_token` del tendero en `Authorization`; `RegistroNegocio` usa
  `crear_comercio`; login reclama comercios sembrados por teléfono. RLS aún off en
  las viejas → la app sigue funcionando.
- **Fase 3 — Activar RLS + políticas (la peligrosa).** `enable row level security`
  en todas las tablas existentes + políticas (tendero por `es_miembro`, catálogo
  maestro solo lectura, admin por `is_admin`). Redirige los flujos de "Pegar
  pedido" / "Importar contactos" a escribir en las colas `*_sugeridos` en vez de
  las maestras. **Trae SQL de rollback** (desactivar RLS + drop de políticas).
- **Fase 4 — App web admin.** `apps/admin-web/` (Vite+React+supabase-js), login
  email/contraseña + chequeo `is_admin()`, y las pantallas de curaduría/operación:
  aprobar proveedores/productos sugeridos, fusionar duplicados, revisar
  promociones, pedidos de todos los negocios, sugerencias de cambio, métricas/IDC.

Cada fase va en su propio PR.

## Notas de seguridad
- Nunca el `service_role` key en un cliente (salta RLS). El panel admin usa anon
  key + la sesión del admin; RLS hace cumplir los poderes.
- El primer admin se inserta a mano en el SQL Editor (el `admins` no tiene política
  de escritura desde el cliente).
- `reclamar_comercios_por_telefono` compara `comercios.telefono` con
  `auth.users.phone` (E.164). Verificar/normalizar el formato antes de producción.
