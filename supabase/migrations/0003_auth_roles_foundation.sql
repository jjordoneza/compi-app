-- Gap #2 · Fase 1 — Fundación de roles y auth (SEGURA / ADITIVA).
-- NO activa RLS en las tablas existentes (eso es Fase 3). Solo crea tablas nuevas,
-- helpers y RPCs. La app actual (anon key) sigue funcionando igual.
-- Aplicar desde el SQL Editor del dashboard de Supabase. Asume PKs uuid.

-- ───────────────────────────────────────────────────────────────────────────
-- Tablas de identidad y rol
-- ───────────────────────────────────────────────────────────────────────────

-- Admins: estar aquí es lo ÚNICO que otorga poderes de curaduría.
create table if not exists admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  created_at timestamptz not null default now()
);

-- Vincula un usuario-tendero (auth.users) a su(s) comercio(s). 1 usuario → N comercios.
create table if not exists comercio_miembros (
  comercio_id uuid not null references comercios(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rol         text not null default 'dueño',
  created_at  timestamptz not null default now(),
  primary key (comercio_id, user_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers (SECURITY DEFINER para que las políticas RLS no recursen al leer
-- admins / comercio_miembros, y puedan evaluarse aunque esas tablas tengan RLS).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function es_miembro(cid uuid)
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from comercio_miembros
    where comercio_id = cid and user_id = auth.uid()
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Colas de curaduría (opción b): el tendero propone, el admin aprueba.
-- La app RN escribirá aquí (en Fase 3) en vez de crear directo en las maestras.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists proveedores_sugeridos (
  id                   uuid primary key default gen_random_uuid(),
  comercio_id          uuid not null references comercios(id) on delete cascade,
  sugerido_por         uuid references auth.users(id),
  nombre               text not null,
  categoria            text,
  canal                text,
  estado               text not null default 'pendiente'
                         check (estado in ('pendiente','aprobado','rechazado')),
  proveedor_maestro_id uuid references proveedores_maestro(id), -- se llena al aprobar
  created_at           timestamptz not null default now()
);

create table if not exists productos_sugeridos (
  id                  uuid primary key default gen_random_uuid(),
  comercio_id         uuid not null references comercios(id) on delete cascade,
  relacion_id         uuid references relaciones(id) on delete cascade,
  sugerido_por        uuid references auth.users(id),
  nombre              text not null,
  presentacion        text,
  categoria           text,
  precio_pactado      numeric,  -- precio deseado para la relación; se aplica al aprobar
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente','aprobado','rechazado')),
  producto_maestro_id uuid references productos_maestro(id), -- se llena al aprobar
  created_at          timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS en las tablas NUEVAS (desde su nacimiento). Las tablas existentes NO se
-- tocan en esta fase.
-- ───────────────────────────────────────────────────────────────────────────

alter table admins               enable row level security;
alter table comercio_miembros    enable row level security;
alter table proveedores_sugeridos enable row level security;
alter table productos_sugeridos   enable row level security;

-- admins: solo un admin ve la lista. Sin políticas de escritura → nadie desde el
-- cliente puede insertar/editar; el primer admin se crea a mano en el SQL Editor
-- (el service_role del dashboard salta RLS).
create policy admins_select on admins
  for select using (is_admin());

-- comercio_miembros: el usuario ve sus filas; el admin todo. Escritura vía RPC.
create policy cm_select on comercio_miembros
  for select using (user_id = auth.uid() or is_admin());

-- Colas: el tendero ve/inserta las de su comercio; el admin ve y resuelve todo.
create policy ps_select on proveedores_sugeridos
  for select using (es_miembro(comercio_id) or is_admin());
create policy ps_insert on proveedores_sugeridos
  for insert with check (es_miembro(comercio_id) and estado = 'pendiente');
create policy ps_admin_update on proveedores_sugeridos
  for update using (is_admin());

create policy pr_select on productos_sugeridos
  for select using (es_miembro(comercio_id) or is_admin());
create policy pr_insert on productos_sugeridos
  for insert with check (es_miembro(comercio_id) and estado = 'pendiente');
create policy pr_admin_update on productos_sugeridos
  for update using (is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- RPCs (SECURITY DEFINER) para operaciones que el tendero no podría hacer solo.
-- ───────────────────────────────────────────────────────────────────────────

-- Crea un comercio y la membresía del usuario actual, de forma atómica.
create or replace function crear_comercio(
  p_nombre text, p_barrio text, p_telefono text, p_proveedores_totales int
)
returns comercios
language plpgsql security definer set search_path = public as $$
declare c comercios;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercios (nombre, barrio, telefono, proveedores_totales)
    values (p_nombre, p_barrio, p_telefono, p_proveedores_totales)
    returning * into c;
  insert into comercio_miembros (comercio_id, user_id, rol)
    values (c.id, auth.uid(), 'dueño');
  return c;
end; $$;

-- Reclama comercios sembrados cuyo telefono coincide con el phone del usuario.
-- OJO: Supabase guarda auth.users.phone en E.164 (ej. +57300...). Si comercios.telefono
-- no está normalizado igual, ajustar la comparación antes de usar en producción.
create or replace function reclamar_comercios_por_telefono()
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;
  insert into comercio_miembros (comercio_id, user_id, rol)
    select c.id, auth.uid(), 'dueño'
    from comercios c
    join auth.users u on u.id = auth.uid()
    where c.telefono = u.phone
      and not exists (
        select 1 from comercio_miembros m
        where m.comercio_id = c.id and m.user_id = auth.uid()
      );
  get diagnostics n = row_count;
  return n;
end; $$;

comment on table admins is 'Usuarios con poderes de curaduría. Estar aquí = admin. El primer admin se inserta a mano en el SQL Editor.';
comment on table comercio_miembros is 'Vínculo usuario(auth)↔comercio. Base del scope de RLS del tendero (Fase 3).';
