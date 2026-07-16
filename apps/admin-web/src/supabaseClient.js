import { createClient } from '@supabase/supabase-js';

// Misma URL/anon key que el cliente RN (supabase.js en la raíz del repo) —
// la anon key es pública por diseño de Supabase, la barrera real es RLS +
// is_admin(). Aquí sí se usa supabase-js: la regla de "no supabase-js" es
// solo para el cliente RN (rompe con Hermes), no aplica a este navegador.
const SUPABASE_URL = 'https://gaxugvogfxbwhhburrai.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheHVndm9nZnhid2hoYnVycmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODg1ODYsImV4cCI6MjA5OTQ2NDU4Nn0.wCD60L-Aa12kgDbkLukUsjFwEAExtMmtcLM3_uGf73U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
