-- Sugerencia de reabastecimiento como push proactivo — hoy sugerencia_reabastecimiento
-- (migración 0001) solo se calcula cuando el tendero abre el Home (InicioScreen.js);
-- si no vuelve a abrir la app, nunca se entera que "ya le tocaría reponer X".
-- Deferido a propósito en la migración 0039 ("necesita pg_cron + no duplicar
-- aviso") — se retoma ahora.
--
-- Reglas de negocio (CLAUDE.md, ya cumplidas por sugerencia_reabastecimiento):
-- mínimo 3 compras históricas, multiplicador 1.3x, UNA sugerencia a la vez.
-- Al insertar en notificaciones (comercio_id, no producto_id) queda agrupada
-- por comercio automáticamente — nunca más de 1 notificación de este tipo por
-- comercio por corrida.
--
-- Dedup: notificado_en en reabastecimiento_sugerencias marca que esa sugerencia
-- puntual ya generó push — no se vuelve a notificar hasta que sea una sugerencia
-- NUEVA (otro producto, o la misma tras un ciclo de compra distinto).

alter table reabastecimiento_sugerencias add column if not exists notificado_en timestamptz;

comment on column reabastecimiento_sugerencias.notificado_en is 'Cuándo se envió el push proactivo para esta sugerencia puntual (null = todavía no se notificó). Evita re-notificar la misma sugerencia en cada corrida del cron.';

-- ───────────────────────────────────────────────────────────────────────────
-- notificar_reabastecimientos_pendientes() — recorre los comercios activos,
-- reusa sugerencia_reabastecimiento() (mismo cálculo que ya usa el Home, un
-- solo lugar de verdad para la regla de negocio) y registra/actualiza el log
-- en reabastecimiento_sugerencias con el MISMO algoritmo de "reusar pendiente
-- del mismo producto, marcar ignorada cualquier otra" que ya usa el cliente
-- (registrarSugerencia() en InicioScreen.js) — se duplica ese algoritmo acá
-- porque este cron corre sin que el tendero tenga la app abierta, no hay
-- forma de reusar el código JS.
--
-- No expuesta vía REST: se revoca EXECUTE de anon/authenticated más abajo —
-- es un job interno, no una acción que el cliente deba poder disparar.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function notificar_reabastecimientos_pendientes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comercio record;
  v_producto_id uuid;
  v_producto_relacion_id uuid;
  v_dias_desde_ultima integer;
  v_promedio_intervalo numeric;
  v_umbral_dias numeric;
  v_multiplicador_usado numeric;
  v_sugerencia_id uuid;
  v_notificado_en timestamptz;
  v_producto_nombre text;
  v_enviadas integer := 0;
begin
  for v_comercio in select id from comercios where activo = true loop
    v_producto_id := null;
    v_producto_relacion_id := null;

    select producto_id, producto_relacion_id, dias_desde_ultima, promedio_intervalo, umbral_dias, multiplicador_usado
      into v_producto_id, v_producto_relacion_id, v_dias_desde_ultima, v_promedio_intervalo, v_umbral_dias, v_multiplicador_usado
      from sugerencia_reabastecimiento(v_comercio.id);

    if v_producto_relacion_id is null then
      continue;
    end if;

    v_sugerencia_id := null;
    v_notificado_en := null;

    select id, notificado_en into v_sugerencia_id, v_notificado_en
      from reabastecimiento_sugerencias
      where comercio_id = v_comercio.id and producto_id = v_producto_id and respuesta = 'pendiente';

    if v_sugerencia_id is null then
      -- La cadencia cambió de candidato desde la última corrida (o el
      -- tendero nunca abrió el Home para esta): cualquier pendiente vieja de
      -- OTRO producto para este comercio queda obsoleta.
      update reabastecimiento_sugerencias
        set respuesta = 'ignorada', respondida_en = now()
        where comercio_id = v_comercio.id and respuesta = 'pendiente';

      insert into reabastecimiento_sugerencias (
        comercio_id, producto_id, producto_relacion_id,
        promedio_intervalo, multiplicador_usado, umbral_dias, dias_desde_ultima,
        respuesta
      ) values (
        v_comercio.id, v_producto_id, v_producto_relacion_id,
        v_promedio_intervalo, v_multiplicador_usado, v_umbral_dias, v_dias_desde_ultima,
        'pendiente'
      )
      on conflict (comercio_id, producto_id) where respuesta = 'pendiente'
      do nothing
      returning id, notificado_en into v_sugerencia_id, v_notificado_en;

      if v_sugerencia_id is null then
        -- Carrera con el cliente (el tendero abrió el Home justo ahora):
        -- relee la fila que ganó.
        select id, notificado_en into v_sugerencia_id, v_notificado_en
          from reabastecimiento_sugerencias
          where comercio_id = v_comercio.id and producto_id = v_producto_id and respuesta = 'pendiente';
      end if;
    end if;

    if v_sugerencia_id is not null and v_notificado_en is null then
      begin
        select nombre into v_producto_nombre from productos_maestro where id = v_producto_id;

        insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
          values (
            v_comercio.id, 'reabastecimiento_sugerido', 'Ya te tocaría reponer',
            'Hace ' || v_dias_desde_ultima || ' días no pides ' || coalesce(v_producto_nombre, 'este producto') || '.',
            jsonb_build_object('producto_id', v_producto_id, 'producto_relacion_id', v_producto_relacion_id, 'sugerencia_id', v_sugerencia_id)
          );

        update reabastecimiento_sugerencias set notificado_en = now() where id = v_sugerencia_id;
        v_enviadas := v_enviadas + 1;
      exception when others then
        null; -- un fallo de notificación no debe tumbar el resto del recorrido
      end;
    end if;
  end loop;

  return v_enviadas;
end;
$$;

comment on function notificar_reabastecimientos_pendientes is 'Job de pg_cron: genera 1 notificación proactiva por comercio (nunca por producto) cuando sugerencia_reabastecimiento() detecta que ya tocaría reponer algo y todavía no se avisó por esa sugerencia puntual. No expuesta vía REST.';

revoke execute on function notificar_reabastecimientos_pendientes() from public;
revoke execute on function notificar_reabastecimientos_pendientes() from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Corre 1 vez al día, 9am hora Colombia (14:00 UTC, sin horario de verano).
-- pg_cron ya está habilitado (migración 0010).
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

select cron.schedule(
  'notificar_reabastecimientos_pendientes',
  '0 14 * * *',
  $$select notificar_reabastecimientos_pendientes()$$
);
