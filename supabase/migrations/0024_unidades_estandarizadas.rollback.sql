-- Rollback de 0024: restaura aprobar_producto_sugerido al cuerpo de 0023 (sin
-- propagar unidad_base/marca/presentacion/factor_conversion/unidad_pedido) y
-- quita las columnas nuevas.
create or replace function aprobar_producto_sugerido(
  p_sugerido_id uuid,
  p_producto_maestro_id uuid default null
)
returns productos_maestro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug productos_sugeridos;
  v_prod productos_maestro;
  v_existe uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from productos_sugeridos where id = p_sugerido_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerido_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  if p_producto_maestro_id is null then
    insert into productos_maestro (nombre, presentacion, categoria)
      values (v_sug.nombre, v_sug.presentacion, coalesce(v_sug.categoria, ''))
      returning * into v_prod;
  else
    select * into v_prod from productos_maestro where id = p_producto_maestro_id;
    if not found then
      raise exception 'Producto maestro % no existe', p_producto_maestro_id;
    end if;
  end if;

  select id into v_existe from productos_relacion
    where relacion_id = v_sug.relacion_id and producto_id = v_prod.id
    limit 1;

  if v_existe is null then
    insert into productos_relacion (relacion_id, producto_id, precio_pactado)
      values (v_sug.relacion_id, v_prod.id, v_sug.precio_pactado);
  else
    update productos_relacion
      set precio_pactado = coalesce(v_sug.precio_pactado, precio_pactado)
      where id = v_existe;
  end if;

  update productos_sugeridos
    set estado = 'aprobado', producto_maestro_id = v_prod.id
    where id = p_sugerido_id;

  insert into admin_audit_log (admin_user_id, accion, tabla_afectada, registro_id, detalle)
    values (auth.uid(), 'aprobar_producto_sugerido', 'productos_sugeridos', p_sugerido_id,
      jsonb_build_object('producto_maestro_id', v_prod.id, 'creado_nuevo', p_producto_maestro_id is null));

  return v_prod;
end;
$$;

alter table productos_sugeridos drop column if exists unidad_base;
alter table productos_sugeridos drop column if exists factor_conversion;
alter table productos_sugeridos drop column if exists unidad_pedido;
alter table productos_sugeridos drop column if exists marca;

alter table productos_relacion drop column if exists presentacion;
alter table productos_relacion drop column if exists factor_conversion;
alter table productos_relacion drop column if exists unidad_pedido;

alter table productos_maestro drop column if exists unidad_base;
