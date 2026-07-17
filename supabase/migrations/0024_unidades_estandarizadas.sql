-- Retoma docs/catalogo-matching-unidades.md §1 (diseño aprobado, nunca
-- implementado): la presentación deja de ser una verdad única del producto
-- maestro y pasa a vivir en la relación — cada proveedor empaca a su manera.
-- productos_maestro.presentacion (columna actual) queda legacy, no
-- autoritativa; las pantallas migran a leer productos_relacion.presentacion
-- con fallback al maestro.
--
-- unidad_pedido es nuevo respecto al diseño original: cómo el tendero ELIGE
-- comprar en la UI ("2 cajas"), distinto de unidad_base que es para cálculos
-- internos (motor de reabastecimiento, precio unitario implícito). La
-- conversión entre ambos la hace factor_conversion, sin que el tendero tenga
-- que pensarla.

alter table productos_maestro add column if not exists unidad_base text
  check (unidad_base in ('unidad', 'kg', 'litro'));

alter table productos_relacion add column if not exists presentacion text;
alter table productos_relacion add column if not exists factor_conversion numeric;
alter table productos_relacion add column if not exists unidad_pedido text;

-- Backfill: presentacion hereda del maestro al que apunta cada fila;
-- factor_conversion arranca en 1 (placeholder seguro, se corrige con el
-- tiempo vía curaduría o edición directa del tendero).
update productos_relacion pr
  set presentacion = pm.presentacion
  from productos_maestro pm
  where pr.producto_id = pm.id and pr.presentacion is null;

update productos_relacion set factor_conversion = 1 where factor_conversion is null;

comment on column productos_maestro.unidad_base is 'Unidad de cálculo interno (unidad/kg/litro) para el motor de reabastecimiento y estadísticas. Nullable — se completa con el tiempo. NO es lo que ve el tendero al pedir (eso es unidad_pedido, en la relación).';
comment on column productos_relacion.presentacion is 'Presentación específica de este proveedor (ej. "Caja x24"). Reemplaza a productos_maestro.presentacion como fuente de verdad — ese campo queda legacy.';
comment on column productos_relacion.factor_conversion is 'Cuántas unidad_base trae esta presentación (ej. 24 si unidad_base=unidad y presentacion=Caja x24). Default 1 (backfill), se afina con el tiempo.';
comment on column productos_relacion.unidad_pedido is 'Cómo el tendero elige comprar en la UI (caja, unidad, bulto, paca, ...). Distinto de unidad_base (cálculo interno). Nullable — la UI cae a "unidad" si no está.';

-- productos_sugeridos gana los mismos metadatos que puede extraer ai-proxy,
-- para que no se pierdan camino a la cola de curaduría (mismo motivo que
-- llevó precio_pactado ahí desde 0011).
alter table productos_sugeridos add column if not exists unidad_base text;
alter table productos_sugeridos add column if not exists factor_conversion numeric;
alter table productos_sugeridos add column if not exists unidad_pedido text;
alter table productos_sugeridos add column if not exists marca text;

comment on column productos_sugeridos.unidad_base is 'Igual que productos_maestro.unidad_base — se propaga al aprobar.';
comment on column productos_sugeridos.factor_conversion is 'Igual que productos_relacion.factor_conversion — se propaga al aprobar.';
comment on column productos_sugeridos.unidad_pedido is 'Igual que productos_relacion.unidad_pedido — se propaga al aprobar.';
comment on column productos_sugeridos.marca is 'Igual que productos_maestro.marca — se propaga al aprobar.';

-- aprobar_producto_sugerido (mismo cuerpo de 0023 + audit log, misma firma)
-- ahora propaga unidad_base/marca al crear productos_maestro, y
-- presentacion/factor_conversion/unidad_pedido a productos_relacion.
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
    insert into productos_maestro (nombre, presentacion, categoria, unidad_base, marca)
      values (v_sug.nombre, v_sug.presentacion, coalesce(v_sug.categoria, ''), v_sug.unidad_base, v_sug.marca)
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
    insert into productos_relacion (relacion_id, producto_id, precio_pactado, presentacion, factor_conversion, unidad_pedido)
      values (v_sug.relacion_id, v_prod.id, v_sug.precio_pactado, v_sug.presentacion, coalesce(v_sug.factor_conversion, 1), v_sug.unidad_pedido);
  else
    update productos_relacion
      set precio_pactado = coalesce(v_sug.precio_pactado, precio_pactado),
          presentacion = coalesce(v_sug.presentacion, presentacion),
          factor_conversion = coalesce(v_sug.factor_conversion, factor_conversion),
          unidad_pedido = coalesce(v_sug.unidad_pedido, unidad_pedido)
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
