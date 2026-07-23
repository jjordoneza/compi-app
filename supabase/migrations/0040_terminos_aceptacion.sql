-- Pantalla de aceptación de Términos de Uso y Política de Privacidad, con
-- histórico verificable — el usuario lo pidió explícitamente pensando en la
-- SIC: la Ley 1581 de 2012 exige poder demostrar que el titular autorizó el
-- tratamiento, así que no basta con mostrar el texto, hay que poder probar
-- cuándo y qué versión exacta aceptó cada usuario.
--
-- El contenido vive en la base (documentos_legales), no solo en docs/*.md:
-- así el registro de aceptación queda ligado al TEXTO EXACTO que el usuario
-- vio. docs/*.md sigue siendo el borrador de trabajo/fuente para redactar,
-- pero lo que cuenta como evidencia es lo que quedó grabado aquí en el
-- momento de la aceptación — si el texto cambia, es una fila NUEVA, nunca un
-- UPDATE sobre una versión ya aceptada por alguien.

create table if not exists documentos_legales (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('terminos', 'privacidad')),
  version     text not null, -- identificador legible, ej. '2026-07-22-borrador'
  contenido   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_documentos_legales_vigente on documentos_legales (tipo, created_at desc);

alter table documentos_legales enable row level security;

-- Cualquier usuario autenticado puede leer el contenido (lo necesita para
-- decidir si acepta) — no hay dato sensible aquí, es texto legal público.
create policy documentos_legales_select on documentos_legales
  for select using (auth.uid() is not null or is_admin());

comment on table documentos_legales is 'Versiones de Términos de Uso y Política de Privacidad. Cada fila es inmutable — un cambio de contenido crea una fila nueva (nunca UPDATE), para que terminos_aceptaciones pueda demostrar exactamente qué texto aceptó cada usuario. Sin policy de insert/update/delete para clientes: el contenido se agrega por migración, no hay editor en admin-web todavía.';

create table if not exists terminos_aceptaciones (
  id                        uuid primary key default gen_random_uuid(),
  usuario_id                uuid not null references auth.users(id),
  documento_terminos_id     uuid not null references documentos_legales(id),
  documento_privacidad_id   uuid not null references documentos_legales(id),
  aceptado_en               timestamptz not null default now()
);

create index if not exists idx_terminos_aceptaciones_usuario on terminos_aceptaciones (usuario_id, aceptado_en desc);

alter table terminos_aceptaciones enable row level security;

create policy terminos_aceptaciones_select on terminos_aceptaciones
  for select using (usuario_id = auth.uid() or is_admin());
create policy terminos_aceptaciones_insert on terminos_aceptaciones
  for insert with check (usuario_id = auth.uid());
-- Sin policy de update/delete para nadie, ni siquiera el propio usuario: es
-- un registro de consentimiento histórico, debe quedar inmutable — mismo
-- criterio que admin_audit_log (migración 0023).

comment on table terminos_aceptaciones is 'Historial de aceptación de términos/privacidad por usuario — evidencia de autorización ante la Ley 1581 de 2012. Insert-only: nunca se edita ni se borra una fila existente.';

-- ───────────────────────────────────────────────────────────────────────────
-- terminos_pendientes() — true si el usuario autenticado NO ha aceptado la
-- versión vigente (más reciente) de AMBOS documentos. Centraliza la regla acá
-- (no en el cliente) para que un futuro cambio de versión dispare el re-pedido
-- de consentimiento sin tocar la app.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function terminos_pendientes()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select not exists (
    select 1 from terminos_aceptaciones ta
    where ta.usuario_id = auth.uid()
      and ta.documento_terminos_id = (select id from documentos_legales where tipo = 'terminos' order by created_at desc limit 1)
      and ta.documento_privacidad_id = (select id from documentos_legales where tipo = 'privacidad' order by created_at desc limit 1)
  );
$$;

comment on function terminos_pendientes is 'true si el usuario autenticado no ha aceptado todavía la versión vigente de Términos de Uso y Política de Privacidad.';

-- ───────────────────────────────────────────────────────────────────────────
-- aceptar_terminos() — registra la aceptación de la versión vigente actual
-- para el usuario autenticado. El cliente no maneja ids de documentos, solo
-- llama la función.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function aceptar_terminos()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_terminos_id uuid;
  v_privacidad_id uuid;
begin
  select id into v_terminos_id from documentos_legales where tipo = 'terminos' order by created_at desc limit 1;
  select id into v_privacidad_id from documentos_legales where tipo = 'privacidad' order by created_at desc limit 1;

  if v_terminos_id is null or v_privacidad_id is null then
    raise exception 'No hay documentos legales vigentes para aceptar';
  end if;

  insert into terminos_aceptaciones (usuario_id, documento_terminos_id, documento_privacidad_id)
    values (auth.uid(), v_terminos_id, v_privacidad_id);
end;
$$;

comment on function aceptar_terminos is 'Registra la aceptación de la versión vigente de Términos de Uso y Política de Privacidad para el usuario autenticado.';

-- ───────────────────────────────────────────────────────────────────────────
-- Semilla: primera versión de cada documento (contenido real de
-- docs/terminos-de-uso.md y docs/politica-de-privacidad.md, sin el bloque de
-- advertencia interna del borrador — ese bloque es una nota para quien
-- desarrolla, no parte del texto legal).
--
-- OJO — antes de un lanzamiento real a tenderos: los dos documentos todavía
-- tienen placeholders [COMPLETAR: ...] (NIT, razón social, correo de
-- contacto). Hay que completarlos en los .md Y volver a insertar aquí una
-- fila NUEVA con el texto ya completo (nunca UPDATE sobre esta fila — ver el
-- comment de documentos_legales). Mientras eso no pase, lo que el usuario ve
-- y "acepta" en este build todavía trae esos placeholders visibles.
-- ───────────────────────────────────────────────────────────────────────────
insert into documentos_legales (tipo, version, contenido) values
('terminos', '2026-07-22-borrador', $doc$# Términos de Uso de Compi

Última actualización: [COMPLETAR: fecha de publicación].

## 1. Quiénes somos y qué es Compi

Compi es una aplicación operada por **[COMPLETAR: razón social, ej. JJ
Tecnología S.A.S.]**, identificada con NIT **[COMPLETAR]**, domiciliada en
**[COMPLETAR: ciudad, Colombia]** ("**Compi**", "**nosotros**").

Compi ayuda a tenderos de tiendas de barrio en Colombia a **abastecerse**
desde varios proveedores con la menor fricción posible: arma pedidos,
los envía a los proveedores correspondientes y muestra su estado. Compi
**no es** un sistema de inventario, un CRM ni una herramienta de
administración general del negocio.

Al crear una cuenta o usar la app, usted acepta estos Términos. Si no está
de acuerdo, no debe usar Compi.

## 2. Quién puede usar Compi

Compi está dirigido a personas mayores de edad que actúan en nombre de un
comercio real (tienda de barrio u otro negocio de abastecimiento similar).
No está dirigido a menores de 18 años.

El registro se verifica por número de celular (código de un solo uso). Usted
es responsable de mantener el acceso a ese número y de la actividad que
ocurra en su cuenta.

## 3. Cómo funciona Compi

- Usted crea o se vincula a un **comercio** y a los **proveedores** con los
  que ya trabaja.
- Arma un **abastecimiento**, que Compi divide automáticamente en un
  **pedido por proveedor**.
- Compi muestra el estado de cada pedido (`Procesando`, `Confirmado`,
  `Entregado`) a medida que el proveedor lo va actualizando.
- El catálogo de productos y proveedores es compartido entre comercios
  (catálogo maestro). Usted no crea ni edita proveedores o productos
  directamente: las propuestas de producto nuevo o corrección de datos
  pasan por una revisión antes de quedar visibles para todos.

## 4. Precios, pagos y entrega

Los precios que ve en Compi son los que su proveedor acordó con usted (o el
precio de referencia más reciente, cuando no hay uno pactado). **Compi no
fija precios ni es parte de la negociación comercial** entre usted y sus
proveedores.

**Compi no procesa pagos.** El pago y la entrega física de la mercancía se
acuerdan y ejecutan directamente entre usted y cada proveedor, por los
medios que ya usaban antes de tener Compi (efectivo, transferencia, crédito
con el proveedor, etc.), salvo que dentro de la app se indique
expresamente lo contrario para un caso particular.

## 5. Rol de Compi frente a los proveedores

Compi es un **intermediario tecnológico**: facilita la comunicación y el
armado del pedido, pero no es el vendedor de los productos ni el
transportador. No garantizamos la disponibilidad, calidad, precio final o
tiempo de entrega de lo que un proveedor ofrece — esa relación comercial es
entre usted y su proveedor.

Si un proveedor incumple, la reclamación es directamente con él. Puede
usar Compi para reportarnos problemas recurrentes con un proveedor y
ayudarnos a mejorar el catálogo, pero eso no nos convierte en responsables
del incumplimiento.

## 6. Uso permitido

Usted se compromete a:

- Dar información real sobre su comercio y sus proveedores.
- No usar Compi para fines distintos al abastecimiento de su negocio.
- No intentar vulnerar la seguridad de la app, extraer datos masivamente,
  o hacerse pasar por otro comercio o proveedor.

Podemos suspender o cerrar una cuenta que incumpla lo anterior, o que
lleve mucho tiempo inactiva combinada con reportes de datos falsos.

## 7. Propiedad intelectual

El software, diseño, marca "Compi" y el catálogo maestro consolidado son
propiedad de [COMPLETAR: razón social] o de terceros que nos licencian su
uso. Usted conserva los derechos sobre la información propia de su
comercio (por ejemplo, su historial de pedidos), sujeta a la Política de
Privacidad.

## 8. Disponibilidad del servicio

Hacemos lo posible por mantener Compi disponible, pero puede haber
interrupciones por mantenimiento, fallas técnicas o causas fuera de
nuestro control. No garantizamos disponibilidad ininterrumpida.

## 9. Cuenta y eliminación de un negocio

Puede eliminar un comercio desde la app. Al hacerlo, el comercio deja de
aparecer como activo pero el historial no se borra de inmediato — puede
consultarlo y reactivar el negocio más adelante, según se explica dentro
de la propia app.

## 10. Limitación de responsabilidad

En la máxima medida permitida por la ley colombiana, Compi no será
responsable por daños indirectos, lucro cesante, o pérdidas derivadas de
la relación comercial entre usted y sus proveedores, de la indisponibilidad
temporal del servicio, o del uso indebido de su cuenta por terceros que
accedieron a ella sin nuestra culpa.

Nada en esta sección limita derechos que la ley colombiana reconoce de
forma irrenunciable al consumidor bajo la Ley 1480 de 2011.

## 11. Cambios a estos Términos

Podemos actualizar estos Términos. Si el cambio es sustancial, se lo
avisaremos dentro de la app antes de que entre en vigencia.

## 12. Ley aplicable y contacto

Estos Términos se rigen por las leyes de la República de Colombia. Para
cualquier duda, puede escribirnos a **[COMPLETAR: correo de contacto]**.
$doc$),
('privacidad', '2026-07-22-borrador', $doc$# Política de Tratamiento de Datos Personales de Compi

Última actualización: [COMPLETAR: fecha de publicación].

## 1. Responsable del tratamiento

**[COMPLETAR: razón social, ej. JJ Tecnología S.A.S.]**, NIT
**[COMPLETAR]**, domicilio en **[COMPLETAR: ciudad]**, correo de contacto
**[COMPLETAR]**, es responsable del tratamiento de los datos personales
que usted nos entrega al usar Compi, en los términos de la Ley 1581 de
2012 y el Decreto 1377 de 2013.

## 2. Qué datos recolectamos

- **Datos de la persona que usa la app**: nombre, número de celular
  (usado también para verificación por OTP).
- **Datos del comercio**: nombre del negocio, dirección, ubicación
  (latitud/longitud), ciudad, barrio.
- **Datos de la relación con proveedores**: qué proveedores usa, precios
  pactados, días de pedido, mínimos de compra.
- **Historial de uso**: abastecimientos y pedidos hechos, cambios de
  estado, productos comprados y su frecuencia.
- **Datos técnicos**: token de notificaciones push del dispositivo (si
  usted acepta recibirlas).

No recolectamos datos financieros de tarjetas ni procesamos pagos dentro
de la app (ver Términos de Uso, sección 4).

## 3. Cómo obtenemos su autorización

Al crear su cuenta y registrar su comercio, le pedimos de forma expresa su
autorización para el tratamiento de estos datos conforme a esta Política,
mediante una casilla de aceptación que **no viene marcada por defecto**.
Usted puede revocar esta autorización en cualquier momento (ver sección 7),
sin perjuicio de que dejar de autorizar ciertos tratamientos puede
implicar que no podamos seguir prestándole el servicio.

## 4. Para qué usamos sus datos (finalidades)

1. **Prestar el servicio**: armar y enviar sus pedidos, mostrarle su
   catálogo, calcular precios de la relación con cada proveedor, mostrar
   el estado de sus pedidos y notificarle sus cambios.
2. **Soporte y mejora del producto**: entender fallas, resolver dudas,
   mejorar el catálogo maestro y las recomendaciones de cobertura.
3. **Uso estadístico y comercial agregado.** Sus datos —o información
   derivada de ellos— podrán usarse para generar estadísticas de mercado
   (por ejemplo, tendencias de compra por zona, categoría o proveedor) y
   esa información **podrá compartirse o comercializarse con proveedores,
   aliados comerciales o terceros interesados**, priorizando siempre
   información agregada o anonimizada que no lo identifique
   individualmente. Cuando no sea posible anonimizarla por completo (por
   ejemplo, si usted es una persona natural fácilmente identificable en un
   conjunto de datos pequeño), este uso solo se hará si usted lo autorizó
   expresamente para ese fin específico.
   *(Nota interna: esta finalidad describe una capacidad que Compi
   todavía no activa operativamente — ver `docs/gaps-pendientes.md`. Se
   incluye desde ya en la autorización para no tener que volver a pedir
   consentimiento a toda la base de usuarios el día que se active.)*
4. **Cumplimiento legal**: atender requerimientos de autoridades
   competentes.

## 5. Con quién compartimos datos

- **Proveedores con los que usted trabaja**: ven los pedidos que usted les
  hace, no el resto de su información.
- **Encargados del tratamiento que operan la infraestructura técnica**:
  actualmente Supabase (base de datos y funciones backend) y Expo/EAS
  (notificaciones push y distribución de la app), y Anthropic para las
  funciones de inteligencia artificial de la app (siempre a través de
  nuestro propio servidor, nunca enviando sus datos directo desde su
  celular). Estos proveedores pueden procesar datos en servidores fuera de
  Colombia; cuando eso ocurra, será bajo las garantías que exige la ley
  colombiana para transferencias internacionales de datos (contratos de
  transferencia o países con nivel adecuado de protección).
- **Terceros para fines comerciales/estadísticos**: solo en los términos
  descritos en la sección 4.3, y solo cuando exista la autorización
  correspondiente.

No vendemos su información de contacto para fines de mercadeo no
relacionado con Compi.

## 6. Seguridad

Aplicamos controles técnicos razonables para proteger su información
(control de acceso por fila a nivel de base de datos, cifrado en tránsito,
separación entre lo que ve un tendero, un proveedor y el panel
administrativo). Ningún sistema es 100% seguro; si detectamos un
incidente que afecte sus datos, se lo informaremos conforme a la ley.

## 7. Sus derechos (Habeas Data)

Como titular de sus datos, usted tiene derecho a:

- **Conocer, actualizar y rectificar** sus datos (por ejemplo, desde
  "Editar mi negocio" dentro de la app).
- **Solicitar prueba de la autorización** otorgada.
- **Ser informado** sobre el uso que le hemos dado a sus datos.
- **Revocar la autorización y/o solicitar la supresión** de sus datos,
  cuando no exista un deber legal o contractual que nos obligue a
  conservarlos.
- **Acceder gratuitamente** a sus datos.

Puede ejercer estos derechos escribiendo a **[COMPLETAR: correo de
contacto / canal de PQRS]**. Responderemos dentro de los plazos que
establece la ley (10 días hábiles para consultas, 15 días hábiles para
reclamos, prorrogables conforme a la norma).

Si considera que sus derechos no fueron atendidos, puede acudir a la
**Superintendencia de Industria y Comercio (SIC)**, autoridad de
protección de datos en Colombia.

## 8. Conservación de los datos

Conservamos sus datos mientras su cuenta esté activa y, tras eliminar un
comercio, durante el tiempo razonable en que la app le permite consultarlo
o reactivarlo, y luego por el término que exijan obligaciones legales o
contables aplicables.

## 9. Menores de edad

Compi no está dirigido a menores de edad y no recolectamos a sabiendas
datos de menores de 18 años.

## 10. Cambios a esta Política

Si cambiamos esta Política de forma sustancial —en especial si ampliamos
las finalidades del tratamiento— se lo informaremos dentro de la app y, si
la ley lo exige, le pediremos una nueva autorización antes de aplicar el
cambio.

## 11. Contacto

Para preguntas sobre esta Política o sobre el tratamiento de sus datos,
escríbanos a **[COMPLETAR: correo de contacto]**.
$doc$);
