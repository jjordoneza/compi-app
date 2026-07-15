-- PR-B — Instrumentación del Motor de Reabastecimiento Predictivo.
-- Registra cada sugerencia mostrada y su respuesta, para poder recalibrar el
-- multiplicador (1.3x) más adelante con datos reales.
-- Aplicar desde el SQL Editor del dashboard de Supabase (después de 0001).
-- Asume PKs uuid (default de Supabase).

create table if not exists reabastecimiento_sugerencias (
  id                    uuid primary key default gen_random_uuid(),
  comercio_id           uuid not null references comercios(id) on delete cascade,
  producto_id           uuid not null references productos_maestro(id),
  producto_relacion_id  uuid references productos_relacion(id),
  generada_en           timestamptz not null default now(),
  promedio_intervalo    numeric,   -- cadencia (días) al momento de generar
  multiplicador_usado   numeric,   -- el 1.3 vigente — sin esto no se recalibra
  umbral_dias           numeric,   -- promedio_intervalo * multiplicador_usado
  dias_desde_ultima     numeric,   -- estado al generar
  respuesta             text not null default 'pendiente'
                          check (respuesta in ('pendiente','aceptada','pospuesta','ignorada')),
  respondida_en         timestamptz,
  ajuste_id             uuid references reabastecimiento_ajustes(id) on delete set null,
  compra_confirmada_en  timestamptz,  -- fecha real de la siguiente compra del SKU (PR-C)
  created_at            timestamptz not null default now()
);

-- Impide dos sugerencias PENDIENTES para el mismo (comercio, producto): la base
-- rechaza un segundo insert aunque la app dispare dos casi simultáneos (no se
-- confía solo en la verificación previa del cliente). También sirve de índice de
-- búsqueda por comercio (columna izquierda).
create unique index if not exists uq_reab_sug_comercio_producto_pendiente
  on reabastecimiento_sugerencias (comercio_id, producto_id)
  where respuesta = 'pendiente';

comment on table reabastecimiento_sugerencias is
  'Log de sugerencias de reabastecimiento mostradas y su outcome. Base para recalibrar el multiplicador.';

-- Liga el "snooze" a la sugerencia que lo originó.
alter table reabastecimiento_ajustes
  add column if not exists sugerencia_id uuid
    references reabastecimiento_sugerencias(id) on delete set null;
