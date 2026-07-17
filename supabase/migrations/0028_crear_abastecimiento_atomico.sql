-- Bug encontrado en la auditoría (checklist A14): ConfirmarPedidoScreen.js armaba
-- el abastecimiento con un loop secuencial de inserts sueltos (abastecimiento →
-- por cada proveedor un pedido → por cada item un pedido_item), sin transacción.
-- Si fallaba a mitad de camino, un reintento del tendero volvía a insertar desde
-- cero y duplicaba lo que ya se había guardado bien en el intento anterior.
--
-- crear_abastecimiento hace todo el árbol en una sola llamada RPC: el cuerpo de
-- una función plpgsql corre dentro de una única transacción implícita — si
-- cualquier insert falla, Postgres revierte todo lo que esa llamada alcanzó a
-- insertar. Un reintento después de un error nunca deja restos parciales.
--
-- p_grupos: jsonb con la forma que ya arma NuevoAbastecimientoScreen.js:
-- [{ "relacion_id": uuid, "items": [{ "producto_relacion_id": uuid, "cantidad": int }, ...] }, ...]
create or replace function crear_abastecimiento(
  p_comercio_id uuid,
  p_grupos jsonb
)
returns abastecimientos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ab abastecimientos;
  v_grupo jsonb;
  v_item jsonb;
  v_pedido_id uuid;
begin
  if not (es_miembro(p_comercio_id) or is_admin()) then
    raise exception 'No tienes acceso a este comercio';
  end if;

  insert into abastecimientos (comercio_id, estado)
    values (p_comercio_id, 'procesando')
    returning * into v_ab;

  for v_grupo in select * from jsonb_array_elements(p_grupos)
  loop
    insert into pedidos (abastecimiento_id, relacion_id, estado)
      values (v_ab.id, (v_grupo->>'relacion_id')::uuid, 'pendiente')
      returning id into v_pedido_id;

    for v_item in select * from jsonb_array_elements(v_grupo->'items')
    loop
      insert into pedido_items (pedido_id, producto_relacion_id, cantidad)
        values (v_pedido_id, (v_item->>'producto_relacion_id')::uuid, (v_item->>'cantidad')::int);
    end loop;
  end loop;

  return v_ab;
end;
$$;

comment on function crear_abastecimiento(uuid, jsonb) is 'Crea un abastecimiento con sus pedidos e items en una sola transacción — evita duplicados si un reintento sigue a un fallo parcial. Solo el dueño del comercio o admin.';
