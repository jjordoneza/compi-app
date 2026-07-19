-- Historial de cambios de estado de un pedido (con fecha/hora), pedido por el
-- usuario para poder revisar el tiempo entre pedido hecho → confirmado →
-- entregado. De paso cierra la nota de seguridad ya documentada en
-- gaps-pendientes.md: actualizarEstadoPedido/actualizarEstadoAbastecimiento
-- (admin-web) eran PATCH directos sin RPC, así que nada en Postgres impedía
-- un estado fuera de secuencia si se llamaba la API directo. La RPC nueva no
-- recibe el estado destino como parámetro — solo avanza al siguiente de la
-- secuencia fija (pendiente → confirmado → entregado), así que ni siquiera
-- llamándola directo se puede saltar un estado o retroceder.
--
-- Nota: "cancelado" y "modificaciones al pedido" quedan explícitamente fuera
-- de esta migración (decisión del usuario, 19 jul 2026) — se diseñan junto
-- con el Motor de Enrutamiento de Pedidos (bloqueado por el trámite de Meta).

-- Defensivo: pedidos es una tabla anterior al sistema de migraciones (no hay
-- CREATE TABLE en el repo) — si por algún motivo no tuviera created_at
-- todavía, esto lo agrega sin tocar filas existentes (default solo aplica a
-- filas nuevas en un ALTER, las viejas quedan con el valor que ya tuvieran o
-- null si la columna es nueva).
alter table pedidos add column if not exists created_at timestamptz not null default now();

create table if not exists pedido_estado_historial (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references pedidos(id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  cambiado_en     timestamptz not null default now()
);

create index if not exists idx_pedido_estado_historial_pedido on pedido_estado_historial(pedido_id);

alter table pedido_estado_historial enable row level security;

create policy peh_select_admin on pedido_estado_historial
  for select using (is_admin());
-- Sin policy de insert: solo se escribe desde avanzar_estado_pedido()
-- (SECURITY DEFINER, dueña de la tabla), nunca directo desde el cliente.

comment on table pedido_estado_historial is 'Historial de transiciones de pedidos.estado, con fecha/hora — permite medir tiempo entre pedido hecho, confirmado y entregado. Se escribe solo desde avanzar_estado_pedido().';

-- ───────────────────────────────────────────────────────────────────────────
-- avanzar_estado_pedido — mueve un pedido a su SIGUIENTE estado (pendiente →
-- confirmado → entregado, sin parámetro de destino), inserta el historial, y
-- recalcula el estado general del abastecimiento a partir de TODOS sus
-- pedidos (mismo criterio que ya usaba PedidosOperacion.jsx en el cliente:
-- todos entregado → entregado; mezcla confirmado/entregado sin pendientes →
-- confirmado; cualquier otra combinación → procesando). Reemplaza el PATCH
-- directo a pedidos/abastecimientos que hacía el panel.
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
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  -- Alias p.* obligatorio: "abastecimiento_id" también es nombre de columna
  -- de salida (RETURNS TABLE), visible como variable PL/pgSQL en toda la
  -- función — sin calificar, Postgres no distingue la variable de la columna
  -- de la tabla y falla con 42702 "ambiguous" (mismo caso que cobertura_confianza,
  -- ver comentario en 0010_cobertura_proveedor.sql).
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

  return query select v_siguiente, v_abastecimiento_id, v_estado_abastecimiento;
end;
$$;

comment on function avanzar_estado_pedido is 'Avanza un pedido a su siguiente estado (pendiente→confirmado→entregado), registra el cambio en pedido_estado_historial y recalcula abastecimientos.estado. No recibe estado destino como parámetro — no se puede saltar ni retroceder. Solo admin.';
