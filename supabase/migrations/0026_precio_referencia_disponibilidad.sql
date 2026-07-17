-- Precio de referencia calculado (mecanismo híbrido): el precio sigue siendo
-- dato de la relación (verdad de cada tendero — no cambia), pero se puede
-- consultar la mediana real de la red para reducir la fricción de partir de
-- cero y detectar precios que se alejan mucho de lo típico. Mismo patrón de
-- robustez de mediana que el motor de cobertura (0010): percentile_cont(0.5),
-- mínimo 3 comercios con evidencia antes de confiar en el número.

alter table productos_relacion add column if not exists precio_actualizado_en timestamptz;
alter table productos_relacion add column if not exists disponible boolean not null default true;

comment on column productos_relacion.precio_actualizado_en is 'Cuándo se fijó/confirmó por última vez precio_pactado. La UI avisa si pasaron muchos días sin actualizarse.';
comment on column productos_relacion.disponible is 'Si el proveedor tiene este producto disponible ahora mismo. Default true. Sin UI para que el proveedor lo cambie todavía (no existe el canal WhatsApp/panel) — campo listo para cuando exista.';

-- Backfill: los precios ya cargados se consideran "actualizados" en su fecha
-- de creación (mejor aproximación disponible, no hay historial de cuándo
-- cambiaron antes de esta columna).
update productos_relacion
  set precio_actualizado_en = created_at
  where precio_pactado is not null and precio_actualizado_en is null;

-- Trigger, no PATCH del cliente: hay 3+ pantallas que actualizan precio
-- (RelacionDetalleScreen, NuevoAbastecimientoScreen, aprobar_producto_sugerido)
-- y la regla de "cuándo se considera actualizado" vive una sola vez en el
-- núcleo, no repetida en cada una.
create or replace function fn_productos_relacion_precio_actualizado()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' and new.precio_pactado is not null)
     or (tg_op = 'UPDATE' and new.precio_pactado is distinct from old.precio_pactado) then
    new.precio_actualizado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_productos_relacion_precio_actualizado on productos_relacion;
create trigger trg_productos_relacion_precio_actualizado
  before insert or update on productos_relacion
  for each row execute function fn_productos_relacion_precio_actualizado();

-- precio_referencia — mediana de precio_pactado de OTROS comercios (no el que
-- consulta) para el mismo proveedor+producto, en toda la red. Mínimo 3
-- comercios con evidencia (mismo umbral que cobertura_proveedor_stats, decisión
-- explícita de mantenerlo igual en vez de bajarlo a 2). Gateado por
-- es_miembro, mismo patrón que cobertura_confianza/proveedores_recomendados_barrio.
create or replace function precio_referencia(
  p_comercio_id uuid,
  p_proveedor_id uuid,
  p_producto_id uuid
)
returns table (mediana numeric, n_comercios integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (es_miembro(p_comercio_id) or is_admin()) then
    raise exception 'No autorizado para este comercio';
  end if;

  return query
  select
    percentile_cont(0.5) within group (order by pr.precio_pactado)::numeric as mediana,
    count(*)::integer as n_comercios
  from productos_relacion pr
  join relaciones r on r.id = pr.relacion_id
  where r.proveedor_id = p_proveedor_id
    and pr.producto_id = p_producto_id
    and pr.precio_pactado is not null
    and r.activo = true
    and r.comercio_id <> p_comercio_id
  having count(*) >= 3;
end;
$$;

comment on function precio_referencia is 'Mediana de precio_pactado de otros comercios (no el consultante) para un proveedor+producto en toda la red. Sin fila si hay menos de 3 comercios con evidencia — el cliente trata "sin fila" como "sin referencia todavía", nunca bloquea.';
