-- Extiende el patrón de "sugerencia de cambio" a comercios: hoy solo existe
-- para proveedores (sugerencias_cambio_proveedor, tabla pre-existente, RLS en
-- 0007). Los datos "de bajo riesgo" del negocio (nombre, ciudad, barrio,
-- dirección) los sigue editando el tendero directo, sin aprobación — solo los
-- de contacto (teléfono, nombre de quien atiende) pasan por curaduría, porque
-- afectan cómo Compi/proveedores contactan al negocio.
--
-- También agrega motivo_rechazo a sugerencias_cambio_proveedor (no lo tenía,
-- a diferencia de proveedores_sugeridos/productos_sugeridos desde 0011) y las
-- RPCs de aprobación/rechazo para ambas colas — reemplazan el PATCH directo
-- que hacía SugerenciasCambioScreen.js (protegido solo por RLS, sin guardas
-- contra doble-procesamiento).

alter table sugerencias_cambio_proveedor add column if not exists motivo_rechazo text;

create table if not exists sugerencias_cambio_comercio (
  id                      uuid primary key default gen_random_uuid(),
  comercio_id             uuid not null references comercios(id) on delete cascade,
  sugerido_por            uuid references auth.users(id),
  telefono_sugerido       text,
  contacto_nombre_sugerido text,
  estado                  text not null default 'pendiente'
                            check (estado in ('pendiente','aprobada','rechazada')),
  motivo_rechazo          text,
  created_at              timestamptz not null default now()
);

alter table sugerencias_cambio_comercio enable row level security;

create policy sugcambiocom_select on sugerencias_cambio_comercio
  for select using (es_miembro(comercio_id) or is_admin());
create policy sugcambiocom_insert on sugerencias_cambio_comercio
  for insert with check (es_miembro(comercio_id) and estado = 'pendiente');
-- Aprobar/rechazar es curaduría: solo admin.
create policy sugcambiocom_update_admin on sugerencias_cambio_comercio
  for update using (is_admin());

comment on table sugerencias_cambio_comercio is 'Cambios propuestos por el tendero a datos de contacto del negocio (teléfono, nombre de quien atiende) — requieren aprobación admin. nombre/ciudad/barrio/dirección se editan directo, sin esta cola.';

-- ───────────────────────────────────────────────────────────────────────────
-- Cambio de número de proveedor
-- ───────────────────────────────────────────────────────────────────────────
create or replace function aprobar_cambio_numero_proveedor(p_sugerencia_id uuid)
returns proveedores_maestro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug sugerencias_cambio_proveedor;
  v_prov proveedores_maestro;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from sugerencias_cambio_proveedor where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  update proveedores_maestro set telefono = v_sug.telefono_sugerido
    where id = v_sug.proveedor_id
    returning * into v_prov;

  update sugerencias_cambio_proveedor set estado = 'aprobada' where id = p_sugerencia_id;

  return v_prov;
end;
$$;

create or replace function rechazar_cambio_numero_proveedor(
  p_sugerencia_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado from sugerencias_cambio_proveedor where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update sugerencias_cambio_proveedor
    set estado = 'rechazada', motivo_rechazo = p_motivo
    where id = p_sugerencia_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Cambio de contacto de negocio
-- ───────────────────────────────────────────────────────────────────────────
create or replace function aprobar_cambio_comercio(p_sugerencia_id uuid)
returns comercios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug sugerencias_cambio_comercio;
  v_com comercios;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_sug from sugerencias_cambio_comercio where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_sug.estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_sug.estado;
  end if;

  update comercios set
    telefono = coalesce(v_sug.telefono_sugerido, telefono),
    contacto_nombre = coalesce(v_sug.contacto_nombre_sugerido, contacto_nombre)
    where id = v_sug.comercio_id
    returning * into v_com;

  update sugerencias_cambio_comercio set estado = 'aprobada' where id = p_sugerencia_id;

  return v_com;
end;
$$;

create or replace function rechazar_cambio_comercio(
  p_sugerencia_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado from sugerencias_cambio_comercio where id = p_sugerencia_id for update;
  if not found then
    raise exception 'Sugerencia % no encontrada', p_sugerencia_id;
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta sugerencia ya fue %', v_estado;
  end if;

  update sugerencias_cambio_comercio
    set estado = 'rechazada', motivo_rechazo = p_motivo
    where id = p_sugerencia_id;
end;
$$;

comment on function aprobar_cambio_numero_proveedor is 'Aplica el teléfono sugerido a proveedores_maestro y marca la sugerencia aprobada. Solo admin.';
comment on function rechazar_cambio_numero_proveedor is 'Rechaza una sugerencia de cambio de número de proveedor, con motivo opcional. Solo admin.';
comment on function aprobar_cambio_comercio is 'Aplica teléfono/nombre de contacto sugeridos a comercios y marca la sugerencia aprobada. Solo admin.';
comment on function rechazar_cambio_comercio is 'Rechaza una sugerencia de cambio de contacto de negocio, con motivo opcional. Solo admin.';
