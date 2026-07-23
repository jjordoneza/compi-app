-- Revierte avanzar_estado_pedido a la versión de la migración 0038 (sin el
-- INSERT en notificaciones).
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

drop table if exists notificaciones;
drop table if exists push_tokens;
