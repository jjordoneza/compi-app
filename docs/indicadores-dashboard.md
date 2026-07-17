# Compi — Indicadores propuestos para el dashboard de admin

Este documento lista los indicadores discutidos para `apps/admin-web/`, organizados por qué decisión ayudan a tomar. Se marca cuál es el subconjunto priorizado para implementar primero, y cuáles quedan para después. Pendiente de fusionar con la auditoría técnica completa (ver conversación) en un único documento actualizado de arquitectura/producto.

## Corrección previa: el IDC ya no es un porcentaje

El IDC se había definido como `proveedores gestionados por Compi ÷ proveedores_totales declarado por el tendero`. Se corrigió porque `proveedores_totales` se declara una sola vez al registro y no hay ningún límite que impida que un tendero agregue más proveedores reales de los que declaró originalmente — el porcentaje podía superar 100% y dejaba de tener sentido. Ahora el IDC es un **número absoluto**: proveedores gestionados activamente a través de Compi, por comercio y agregado de la red. `proveedores_totales` se mantiene como dato de contexto (lo que el tendero dijo tener al registrarse), pero no como denominador de ningún cálculo.

## 🟢 Prioridad 1 — implementar ahora (decisión tomada)

### 1. Adopción y retención (¿la gente vuelve?)
- **Comercios activos por semana/mes** (hicieron al menos un abastecimiento) vs. comercios totales registrados — cuántos son "turistas" que se registraron y no volvieron.
- **Tiempo entre registro y primer pedido real** — si crece con el tiempo, algo en el onboarding empeoró.
- **Retención por cohorte**: de los comercios registrados en un mes dado, cuántos siguen activos 30/60/90 días después. El indicador más honesto de si Compi genera un hábito real.
- **Tasa de abandono de onboarding**: cuántos llegan a "Registro de negocio" pero nunca completan importar contactos ni hacer su primer pedido.

### 2. Efecto de red (¿el marketplace está funcionando como marketplace?)
- **% de proveedores reutilizados** (ya existían en el catálogo maestro antes de que un comercio nuevo los agregara) vs. creados desde cero — mide si el "Marketplace Invisible" está funcionando de verdad.
- **Proveedores con más de 1 comercio vinculado** — cuántos ya tienen tracción real entre varias tiendas.
- **Densidad por barrio**: comercios activos por barrio — dónde ya hay masa crítica para expandir con confianza vs. dónde está solo.

### 3. Confianza y fricción (dónde se traba la experiencia)
- **Tasa de rechazo/ajuste de pedidos** — ⚠️ depende del canal de WhatsApp con proveedores, que todavía no existe. No se puede construir el indicador en sí todavía; se deja preparado el esquema para cuando exista ese canal.
- **Tiempo promedio de resolución de la cola de curaduría** — ya se puede construir con datos existentes (`proveedores_sugeridos`/`productos_sugeridos`).
- **Señales negativas de cobertura acumuladas por proveedor** — la tabla `cobertura_senales_negativas` ya existe y captura la señal; falta la vista que la agregue por proveedor.

## 🟡 Prioridad 2 — siguiente ronda

### Costo de IA (Anthropic) y Twilio, filtrable por período
Control de gasto real de los dos servicios externos con costo variable. Pospuesto de la ronda anterior para priorizar adopción/red/fricción primero.

### Embudo de abastecimiento
Abastecimientos creados en los últimos 30 días vs. los que llegaron a "entregado" — tasa de abandono real dentro del flujo de compra.

## 🔵 Prioridad 3 — depende de piezas aún no construidas

### Calidad del catálogo
- Ratio de coincidencia vs. creación nueva en "Pegar pedido"/"Importar contactos" (depende de que el matching por similitud con `pg_trgm` esté implementado — hoy solo existe el atajo de nombre exacto).
- Productos/proveedores sin ningún pedido después de X días de aprobados.

### Salud de los motores de inteligencia
- Motor predictivo: tasa de aceptación de sugerencias (aceptada / total generadas) — dato clave para saber si el multiplicador 1.3x necesita recalibrarse.
- Motor de cobertura: % de proveedores con "confianza propia" (evidencia real de `v_cobertura_proveedor`) vs. "heredada" o "sin evidencia" — mide qué tan madura está la red geográficamente.