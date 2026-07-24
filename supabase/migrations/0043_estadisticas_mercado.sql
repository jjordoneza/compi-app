-- Motor de estadísticas de mercado (anonimizadas) — primer paso técnico hacia
-- la finalidad "uso estadístico y comercial" que ya autoriza la Política de
-- Privacidad (sección 4.3, ver migración 0040): tendencias de compra por
-- producto/categoría/zona, nunca datos de un comercio o tendero identificable.
--
-- **Umbral de anonimización (k=3)**: ningún agregado se devuelve si lo
-- sostienen menos de 3 comercios distintos — así un resultado nunca puede
-- rastrearse de vuelta a un tendero puntual (el riesgo real que señala la
-- política: "cuando no sea posible anonimizar por completo... este uso solo
-- se hará si usted lo autorizó expresamente"). Con k>=3, lo que se devuelve
-- ya no es dato personal de nadie — es estadística de mercado.
--
-- Alcance de esta migración: solo el motor (RPCs), sin pantalla en
-- apps/admin-web — el usuario pidió explícitamente no tocar el panel por
-- ahora. Queda listo para conectarse a un dashboard interno o a un futuro
-- producto de datos externo, cuando se decida esa parte de negocio (a quién
-- se le vende, en qué formato, con qué acuerdo de intercambio de datos —
-- nada de eso se resuelve en código).

create or replace function estadisticas_mercado_productos(
  p_categoria text default null,
  p_dias integer default 90
)
returns table (
  producto_id uuid,
  producto_nombre text,
  categoria text,
  cantidad_total numeric,
  comercios_distintos integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    pm.id,
    pm.nombre,
    pm.categoria,
    sum(pi.cantidad) as cantidad_total,
    count(distinct a.comercio_id)::integer as comercios_distintos
  from pedido_items pi
  join productos_relacion pr on pr.id = pi.producto_relacion_id
  join productos_maestro pm on pm.id = pr.producto_id
  join pedidos p on p.id = pi.pedido_id
  join abastecimientos a on a.id = p.abastecimiento_id
  where a.fecha >= now() - make_interval(days => p_dias)
    and (p_categoria is null or pm.categoria = p_categoria)
  group by pm.id, pm.nombre, pm.categoria
  having count(distinct a.comercio_id) >= 3
  order by cantidad_total desc;
end;
$$;

comment on function estadisticas_mercado_productos is 'Estadística de mercado anonimizada: cantidad total pedida por producto (opcionalmente filtrada por categoría) en los últimos p_dias. Nunca devuelve un agregado sostenido por menos de 3 comercios distintos. Solo admin.';

create or replace function estadisticas_mercado_zonas(
  p_producto_id uuid default null,
  p_categoria text default null,
  p_dias integer default 90
)
returns table (
  ciudad text,
  barrio text,
  cantidad_total numeric,
  comercios_distintos integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    c.ciudad,
    c.barrio,
    sum(pi.cantidad) as cantidad_total,
    count(distinct a.comercio_id)::integer as comercios_distintos
  from pedido_items pi
  join productos_relacion pr on pr.id = pi.producto_relacion_id
  join productos_maestro pm on pm.id = pr.producto_id
  join pedidos p on p.id = pi.pedido_id
  join abastecimientos a on a.id = p.abastecimiento_id
  join comercios c on c.id = a.comercio_id
  where a.fecha >= now() - make_interval(days => p_dias)
    and (p_producto_id is null or pm.id = p_producto_id)
    and (p_categoria is null or pm.categoria = p_categoria)
  group by c.ciudad, c.barrio
  having count(distinct a.comercio_id) >= 3
  order by cantidad_total desc;
end;
$$;

comment on function estadisticas_mercado_zonas is 'Estadística de mercado anonimizada: cantidad total pedida por zona (ciudad/barrio), opcionalmente filtrada por producto o categoría, en los últimos p_dias. Nunca devuelve un agregado sostenido por menos de 3 comercios distintos. Solo admin.';
