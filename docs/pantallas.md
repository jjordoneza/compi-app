# Compi — Pantallas del MVP

El MVP no construye las tres apps del roadmap a la vez: solo la **app del tendero** y el **panel de admin**. El proveedor no tiene app — recibe WhatsApp. Dentro de la app del tendero, el flujo de Prioridad 1 cubre 27 pantallas/estados.

Las pantallas #25 y #26 (sugerencia de reabastecimiento y su respuesta) pertenecen al Motor de Reabastecimiento Predictivo — son **Fase 3, no MVP**. Se documentan para no perder el diseño, pero no se construyen todavía.

## Tabla de pantallas

| # | Pantalla | Propósito | Navega a |
|---|----------|-----------|----------|
| 1 | Splash | Presentación de marca al abrir la app | Onboarding |
| 2 | Onboarding (3 slides) | Explicar el beneficio antes del registro | Login |
| 3 | Login | Entrada rápida, campo de celular | Verificación |
| 4 | Verificación | Confirmar número por código (4 casillas) | Registro (si es nuevo) u Home |
| 5 | Registro del negocio | Capturar nombre, barrio, y `proveedores_totales` (denominador del IDC) | Onboarding inteligente |
| 6 | Importar contactos | Poblar proveedores sin digitar, categoría auto-detectada | Pegar pedido viejo u Home |
| 7 | Pegar pedido de WhatsApp | Construir catálogo desde texto real (LLM) | Confirmación del catálogo (7b) |
| 7b | Catálogo detectado | Validar lo que la IA interpretó | Home |
| 8 | Home (primer uso) | Sin historial: CTA "Hacer mi primer pedido" | Abastecimiento nuevo |
| 9 | Home (con historial) | Tarjeta "Repetir tu abastecimiento" + "Empezar pedido nuevo" | Abastecimiento (repetir o nuevo) |
| 10 | Abastecimiento — Repetir | "Esto es lo que pediste la semana pasada", agrupado por proveedor | Confirmar pedido |
| 11 | Abastecimiento — Nuevo | Buscador + "productos que sueles pedir" | Buscar producto o Confirmar |
| 12 | Buscar/agregar producto | Buscador con filtros; "agrégalo tú mismo" va a cola de curaduría admin, NO se crea automático | Vuelve al abastecimiento |
| 13 | Confirmar pedido | Resumen agrupado por proveedor, dirección, total | Pedido enviado |
| 14 | Pedido enviado | Ícono de éxito, número de pedido, hora | Seguimiento |
| 15 | Seguimiento | 3 estados visibles: Procesando/Confirmado/Entregado | Ajuste o vuelve a Pedidos |
| 16 | Ajuste del proveedor | Cambio detectado por LLM, Aceptar/No aceptar | Seguimiento actualizado |
| 17 | Error — permisos de contactos | No bloquear onboarding si niega el permiso | Onboarding manual u Home |
| 18 | Error — sin conexión | Acompañamiento, no error técnico frío | Reintento |
| 19 | Pedidos | Tabs Activos/Entregados | Detalle de pedido |
| 20 | Detalle — pedido entregado | Resumen, "Reportar problema", "Repetir" | — |
| 21 | Proveedores | Lista con categoría y última compra | Detalle de proveedor |
| 22 | Detalle de proveedor | Mínimo de pedido, días de atención, productos frecuentes con precio pactado | Hacer pedido a ese proveedor |
| 23 | Perfil del negocio | Datos, dirección, notificaciones, ayuda, cerrar sesión | — |
| 24 | Notificaciones | Confirmaciones, ajustes que requieren acción, entregas | Pedido/seguimiento relacionado |
| 25 | Home — sugerencia de reabastecimiento (**Fase 3**) | Copy de inferencia honesta, "Sí vamos a surtirlo"/"Ya lo compré" | Abastecimiento precargado o 26 |
| 26 | Respuesta — ya lo compré por otro lado (**Fase 3**) | Capturar fuga de abastecimiento para el IDC | Vuelve al Home |
| 27 | Onboarding — loop siguiente proveedor | Progreso "N de X", "Terminar por ahora" siempre disponible | Siguiente proveedor, 7b, u Home |
| 28 | Home — aviso de proveedores pendientes | Tarjeta secundaria descartable, nunca reemplaza al héroe principal | Vuelve al loop (27) |
| 29 | Proveedores — importar catálogo (módulo permanente) | Mismo mecanismo de la pantalla 7, disponible siempre (no solo día 1) | Pegar pedido (7) / catálogo (7b) |

## Nota sobre nombres de archivo
Los nombres de pantalla en esta tabla son conceptuales/de producto. Verificar contra los nombres reales de archivos en `screens/tendero/` del repo antes de asumir una correspondencia 1:1 — pueden no coincidir exactamente (ej. "Abastecimiento — Repetir" podría llamarse `RepetirAbastecimientoScreen.js` o similar).
