-- Infraestructura de push notifications (Expo Push) — gap P2 #5. Alcance de
-- esta migración: guardar tokens + un historial de notificaciones en la app
-- (pantalla 24, "Notificaciones"), y un primer disparador reactivo: cambio de
-- estado de pedido (confirmado/entregado), que ya calculamos en
-- avanzar_estado_pedido (migración 0038) — no necesita cron ni Edge Function
-- adicional para ESTE disparador en particular más allá del webhook que envía
-- el push de verdad (ver supabase/functions/enviar-push).
--
-- Quedan fuera a propósito, para una vuelta futura (documentado en
-- gaps-pendientes.md): notificar al aprobar/rechazar curaduría (producto o
-- proveedor sugerido), y la sugerencia de reabastecimiento proactiva (esa sí
-- necesitaría pg_cron, porque hoy el cálculo es reactivo — se dispara cuando
-- el tendero abre el Home, no hay ningún job que la revise sola).

create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references comercios(id) on delete cascade,
  token       text not null,
  plataforma  text,
  created_at  timestamptz not null default now(),
  unique (comercio_id, token)
);

alter table push_tokens enable row level security;

create policy pt_insert on push_tokens
  for insert with check (es_miembro(comercio_id));
create policy pt_select on push_tokens
  for select using (es_miembro(comercio_id) or is_admin());

comment on table push_tokens is 'Tokens de Expo Push por comercio (un comercio puede tener varios dispositivos). El cliente hace upsert (on_conflict comercio_id,token) cada vez que abre la app.';

create table if not exists notificaciones (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references comercios(id) on delete cascade,
  tipo        text not null, -- 'pedido_estado' por ahora; abierto a más tipos después
  titulo      text not null,
  cuerpo      text not null,
  leida       boolean not null default false,
  datos       jsonb, -- payload extra para navegar al detalle (ej. pedido_id, abastecimiento_id)
  created_at  timestamptz not null default now()
);

create index if not exists idx_notificaciones_comercio on notificaciones(comercio_id, created_at desc);

alter table notificaciones enable row level security;

create policy notif_select on notificaciones
  for select using (es_miembro(comercio_id) or is_admin());
create policy notif_update_leida on notificaciones
  for update using (es_miembro(comercio_id)) with check (es_miembro(comercio_id));
-- Sin policy de insert: solo se escribe desde funciones SECURITY DEFINER
-- (avanzar_estado_pedido de aquí en adelante, y las que se sumen después) —
-- nunca directo desde el cliente. El envío del push en sí (Expo Push API) lo
-- hace un Database Webhook -> Edge Function al detectar el INSERT, configurado
-- a mano en el dashboard de Supabase (Database → Webhooks) — no hay forma de
-- crear un webhook por migración SQL.

comment on table notificaciones is 'Historial de notificaciones por comercio (pantalla Notificaciones de la app). El envío del push real a Expo lo dispara un Database Webhook sobre el INSERT — ver supabase/functions/enviar-push.';

-- ───────────────────────────────────────────────────────────────────────────
-- avanzar_estado_pedido — mismo comportamiento de la migración 0038, con un
-- INSERT nuevo en notificaciones al confirmar o entregar. CREATE OR REPLACE
-- no puede cambiar el conjunto de columnas de RETURNS TABLE (no es el caso
-- aquí, se mantiene igual), así que no hace falta el drop previo que sí
-- necesitó admin_stats_por_proveedor en 0034.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function avanzar_estado_pedido(p_pedido_id uuid)
returns table (
  estado_nuevo         text,
  abastecimiento_id    uuid,
  abastecimiento_estado text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual text;
  v_abastecimiento_id uuid;
  v_siguiente text;
  v_estado_abastecimiento text;
  v_comercio_id uuid;
  v_proveedor_nombre text;
  v_titulo text;
  v_cuerpo text;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select p.estado, p.abastecimiento_id into v_estado_actual, v_abastecimiento_id
    from pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % no encontrado', p_pedido_id;
  end if;

  v_siguiente := case v_estado_actual
    when 'pendiente' then 'confirmado'
    when 'confirmado' then 'entregado'
    else null
  end;
  if v_siguiente is null then
    raise exception 'El pedido ya está en su estado final (%) o tiene un estado inválido', v_estado_actual;
  end if;

  update pedidos set estado = v_siguiente where id = p_pedido_id;

  insert into pedido_estado_historial (pedido_id, estado_anterior, estado_nuevo)
    values (p_pedido_id, v_estado_actual, v_siguiente);

  select
    case
      when count(*) filter (where p.estado <> 'entregado') = 0 then 'entregado'
      when count(*) filter (where p.estado not in ('confirmado', 'entregado')) = 0 then 'confirmado'
      else 'procesando'
    end
  into v_estado_abastecimiento
  from pedidos p where p.abastecimiento_id = v_abastecimiento_id;

  update abastecimientos set estado = v_estado_abastecimiento where id = v_abastecimiento_id;

  -- Notificación al tendero — best-effort: si algo aquí falla (ej. proveedor
  -- sin nombre resoluble), no debe tumbar el avance de estado en sí, que ya
  -- es lo crítico. Se envuelve en su propio bloque.
  begin
    select a.comercio_id into v_comercio_id from abastecimientos a where a.id = v_abastecimiento_id;
    select pm.nombre into v_proveedor_nombre
      from pedidos p2
      join relaciones r on r.id = p2.relacion_id
      join proveedores_maestro pm on pm.id = r.proveedor_id
      where p2.id = p_pedido_id;

    if v_siguiente = 'confirmado' then
      v_titulo := 'Pedido confirmado';
      v_cuerpo := coalesce(v_proveedor_nombre, 'Tu proveedor') || ' confirmó tu pedido.';
    else
      v_titulo := 'Pedido entregado';
      v_cuerpo := 'Tu pedido de ' || coalesce(v_proveedor_nombre, 'tu proveedor') || ' fue marcado como entregado.';
    end if;

    insert into notificaciones (comercio_id, tipo, titulo, cuerpo, datos)
      values (
        v_comercio_id, 'pedido_estado', v_titulo, v_cuerpo,
        jsonb_build_object('pedido_id', p_pedido_id, 'abastecimiento_id', v_abastecimiento_id, 'estado', v_siguiente)
      );
  exception when others then
    null; -- nunca bloquea el avance de estado por un fallo de notificación
  end;

  return query select v_siguiente, v_abastecimiento_id, v_estado_abastecimiento;
end;
$$;

comment on function avanzar_estado_pedido is 'Avanza un pedido a su siguiente estado (pendiente→confirmado→entregado), registra el cambio en pedido_estado_historial, recalcula abastecimientos.estado, e inserta una notificación para el tendero (dispara el push vía Database Webhook). No recibe estado destino como parámetro. Solo admin.';
