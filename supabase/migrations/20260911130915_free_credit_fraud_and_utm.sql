-- Hallazgo 1: multicuentas regalando creditos de Apify.
-- El credito gratis deja de otorgarse por default de columna; lo otorga
-- explicitamente app/auth/callback/route.ts tras chequear fingerprint.
create table if not exists public.free_credit_claims (
  fingerprint_hash text primary key,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.free_credit_claims enable row level security;
-- Sin policies: solo el service role (que bypassea RLS) lee/escribe esta tabla.
-- anon y authenticated no tienen ningun acceso.

alter table public.users alter column analisis_restantes set default 0;

-- Hallazgo 3: atribucion de campana.
alter table public.users add column if not exists utm_source text;
alter table public.users add column if not exists utm_content text;
