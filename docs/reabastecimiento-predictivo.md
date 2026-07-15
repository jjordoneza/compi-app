# Motor de Reabastecimiento Predictivo — diseño técnico

**Estado**: Fase 3 (no MVP). Este documento define el diseño; la implementación
se hace por PRs separados (ver "Alcance" al final).

## Reglas de producto (de `docs/producto.md`)
- Mínimo **3 compras históricas** de un producto antes de sugerir.
- Multiplicador **1.3x** sobre la cadencia promedio de compra.
- **Una sugerencia a la vez**, nunca una lista.
- Notificaciones agrupadas **por comercio**, nunca por producto.

## Punto de partida
El motor ya estaba implementado **inline en el cliente** (`screens/tendero/InicioScreen.js`,
función `calcularSugerencia`). Dos problemas:
1. **Lógica de negocio en el cliente** — contra la arquitectura "un núcleo, tres
   ventanas". Además hacía N+1 queries (descargaba todos los abastecimientos,
   pedidos y `productos_relacion` del comercio para calcular en el teléfono).
2. **Sin instrumentación** — la sugerencia se mostraba y se descartaba; solo la
   rama "Ya lo compré" se persistía (`reabastecimiento_ajustes`). Imposible
   recalibrar el 1.3x sin historial de qué se sugirió y si acertó.

Este diseño (a) mueve el cálculo al núcleo (Postgres) y (b) instrumenta cada
sugerencia y respuesta.

## Cálculo de la cadencia promedio

Fecha de compra = `abastecimientos.fecha`. Cadena para atribuir un producto a una
fecha:

```
abastecimientos.fecha
  → pedidos (abastecimiento_id)
    → pedido_items (pedido_id)
      → productos_relacion (id = pedido_items.producto_relacion_id)
        → producto_id   ← se agrupa por este (SKU global)
```

Por cada `(comercio_id, producto_id)`:
1. Conjunto de **fechas distintas por día** en que se compró ese `producto_id`.
2. Requerir **≥ 3 compras** (≥ 2 intervalos); si no, sin sugerencia.
3. `promedio_intervalo = media(intervalos consecutivos en días)`.
4. `umbral_dias = promedio_intervalo × multiplicador` (multiplicador = 1.3 por defecto).
5. `dias_desde_ultima = hoy − ultima_compra`. Candidato si
   `dias_desde_ultima ≥ umbral_dias` y no hay `reabastecimiento_ajustes.no_sugerir_antes_de` vigente.
6. **Una sola**: el candidato de mayor `ratio = dias_desde_ultima / umbral_dias`.

## Dónde vive (núcleo = Postgres)

Consumido por `fetch` (patrón de `supabase.js`, sin SDK):
- **Vista** `v_cadencia_producto`: por `(comercio_id, producto_id)`, nº de compras,
  `promedio_intervalo`, `ultima_compra`. Toda la agregación en SQL.
- **RPC** `sugerencia_reabastecimiento(p_comercio_id, p_multiplicador default 1.3)`:
  aplica pasos 2-6 y devuelve **0 o 1 fila**. El `1.3` es **parámetro**, no
  constante hardcodeada — permite experimentar sin re-desplegar la app. La RPC
  devuelve además `multiplicador_usado` (el valor exacto que aplicó), para que la
  instrumentación lo registre sin ruido de redondeo, y el cliente **no** lo pasa
  (deja que la RPC lo gobierne).

La Edge Function `ai-proxy` sigue siendo solo para IA; el cálculo es agregación
pura y su lugar natural es SQL.

## Tablas / columnas

- `sugerencias_cambio_proveedor` es de **cambio de proveedor** — no reutilizable.
- `reabastecimiento_ajustes` (`comercio_id`, `producto_id`, `no_sugerir_antes_de`,
  `motivo`) solo cubre el "snooze". Se le añade `sugerencia_id` para ligar el
  snooze a la sugerencia que lo originó.
- **Nueva tabla `reabastecimiento_sugerencias`** — un registro por sugerencia mostrada:

  | Columna | Tipo | Para qué |
  |---|---|---|
  | `id` | uuid pk | |
  | `comercio_id` | fk comercios | agrupar por comercio |
  | `producto_id` | fk productos_maestro | |
  | `producto_relacion_id` | fk productos_relacion | opción de precio ofrecida |
  | `generada_en` | timestamptz | cuándo se mostró |
  | `promedio_intervalo` | numeric | cadencia al generar |
  | `multiplicador_usado` | numeric | el 1.3 vigente — sin esto no se recalibra |
  | `umbral_dias` | numeric | `promedio_intervalo × multiplicador_usado` |
  | `dias_desde_ultima` | numeric | estado al generar |
  | `respuesta` | text `pendiente/aceptada/pospuesta/ignorada` | outcome |
  | `respondida_en` | timestamptz null | |
  | `ajuste_id` | fk reabastecimiento_ajustes null | liga el "Ya lo compré" |
  | `compra_confirmada_en` | timestamptz null | fecha real de la siguiente compra del SKU |

## Instrumentación (para recalibrar el 1.3x)

- **Al generar**: insertar fila con `respuesta='pendiente'` y
  `multiplicador_usado`/`promedio_intervalo` congelados.
- **"Sí, vamos a surtirlo"**: `respuesta='aceptada'`.
- **"Ya lo compré"**: `respuesta='pospuesta'` + `ajuste_id` al registro de
  `reabastecimiento_ajustes` (con el `motivo` ya capturado).
- **Ignorada**: al generar una nueva sugerencia, marcar las `pendiente` viejas del
  mismo comercio como `ignorada`.
- **Verdad de campo** (`compra_confirmada_en`): cuando después ocurra una compra
  real de ese `producto_id`, ligarla a la sugerencia pendiente más reciente
  (job/trigger posterior). Da el dato de oro: intervalo predicho vs real.

**Recalibración**: con `promedio_intervalo`, `multiplicador_usado` y
`compra_confirmada_en` por evento, se calcula el multiplicador empírico ideal por
comercio/categoría. Como ya es parámetro de la RPC, ajustarlo no toca la app.

## Notificaciones (agrupadas por comercio)
Hoy no hay push; la sugerencia solo se surface en el Home. La entrega (capa
aparte) es un digest **por `comercio_id`**; con "una sugerencia a la vez", en la
práctica es máximo una por comercio por ciclo. Fuera del alcance del primer PR.

## Alcance de implementación
- **PR-A**: vista + RPC en Postgres; el cliente llama a la RPC vía `fetch` en vez
  de calcular (arregla arquitectura + N+1).
- **PR-B**: tabla `reabastecimiento_sugerencias` + `sugerencia_id` en
  `reabastecimiento_ajustes` + instrumentar los tres caminos de respuesta.
- **PR-C** (después): notificaciones agrupadas + `compra_confirmada_en`.

## Notas de despliegue
Las migraciones en `supabase/migrations/` se aplican desde el **SQL Editor del
dashboard de Supabase** (no hay CLI local). Asumen **PKs `uuid`** (default de
Supabase); si alguna tabla usa `bigint`/`int8` identity, ajustar el tipo de las
columnas FK correspondientes.
