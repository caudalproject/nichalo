-- Nichalo MVP — Supabase schema
-- Run this in the Supabase SQL editor for your project.

-- 1) Enums
do $$ begin
  create type plan_tier as enum ('free', 'starter', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type veredicto_tipo as enum ('VIABLE', 'SATURADO', 'MARGINAL');
exception when duplicate_object then null; end $$;

-- 2) Public profile table mirroring auth.users
--
-- Los créditos viven en dos columnas separadas a propósito (ver
-- supabase/migrations/20260912010000_refill_pro_split_credits.sql):
--   creditos_pack  -> comprados (packs) o el cortesía de Free. No vencen.
--   creditos_ciclo -> cupo mensual de Pro. Se resetea en cada renovación y
--                     se pone en 0 al cancelar/vencer. NUNCA toca creditos_pack.
-- El total que ve el usuario es la suma de los dos.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  plan plan_tier not null default 'free',
  creditos_ciclo int not null default 0,
  creditos_pack int not null default 0,
  ultimo_refill_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3) Auto-create a profile row whenever a new auth user signs up. El
-- courtesy credit de Free lo otorga lib/new-user-bootstrap.ts (contra
-- creditos_pack) después de pasar el chequeo anti-fraude de multicuentas —
-- acá no se regala nada.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 4) Analyses table
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  producto text not null,
  pais text not null check (pais in ('AR','MX','CO')),
  costo_estimado numeric(12,2) not null,
  resultado_json jsonb not null,
  score int not null check (score between 0 and 100),
  veredicto veredicto_tipo not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_analyses_user_created
  on public.analyses (user_id, created_at desc);

-- 5) Row Level Security
alter table public.users enable row level security;
alter table public.analyses enable row level security;

drop policy if exists "users self select" on public.users;
create policy "users self select"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "users self update" on public.users;
create policy "users self update"
  on public.users for update
  using (auth.uid() = id);

drop policy if exists "analyses self select" on public.analyses;
create policy "analyses self select"
  on public.analyses for select
  using (auth.uid() = user_id);

-- Resultado compartible sin login: el link usa un UUID no adivinable como
-- token de acceso (no la sesion). Sin restriccion de rol (cubre anon Y
-- authenticated) — un usuario logueado que abre el link de otro tambien
-- tiene que poder verlo. Ver supabase/migrations/20260913130000_* y
-- 20260913140000_fix_public_select_role_scope.sql.
drop policy if exists "analyses public select by id" on public.analyses;
create policy "analyses public select by id"
  on public.analyses for select
  using (true);

drop policy if exists "analyses self insert" on public.analyses;
create policy "analyses self insert"
  on public.analyses for insert
  with check (auth.uid() = user_id);

-- 6) Créditos: descuento y otorgamiento, siempre atómico en SQL.
-- Detalle completo de por qué en supabase/migrations/20260912010000_refill_pro_split_credits.sql.

create or replace function public.descontar_analisis(user_id_param uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set
    creditos_ciclo = case when creditos_ciclo > 0 then creditos_ciclo - 1 else creditos_ciclo end,
    creditos_pack  = case when creditos_ciclo > 0 then creditos_pack else greatest(creditos_pack - 1, 0) end
  where id = user_id_param
    and (creditos_ciclo + creditos_pack) > 0;
$$;

create or replace function public.incrementar_creditos_pack(
  user_id_param uuid,
  amount_param int
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set creditos_pack = creditos_pack + amount_param
  where id = user_id_param;
$$;

create or replace function public.activar_pro(user_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.users
  set plan = 'pro',
      creditos_ciclo = 30,
      ultimo_refill_at = now()
  where id = user_id_param
    and plan is distinct from 'pro'
  returning true;
$$;

create or replace function public.refrescar_ciclo_pro(user_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.users
  set creditos_ciclo = 30,
      ultimo_refill_at = now()
  where id = user_id_param
    and plan = 'pro'
    and (ultimo_refill_at is null or ultimo_refill_at < now() - interval '1 month')
  returning true;
$$;

create or replace function public.cancelar_pro(user_id_param uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set plan = 'free',
      creditos_ciclo = 0
  where id = user_id_param;
$$;

revoke execute on function public.descontar_analisis(uuid) from public, anon, authenticated;
revoke execute on function public.incrementar_creditos_pack(uuid, int) from public, anon, authenticated;
revoke execute on function public.activar_pro(uuid) from public, anon, authenticated;
revoke execute on function public.refrescar_ciclo_pro(uuid) from public, anon, authenticated;
revoke execute on function public.cancelar_pro(uuid) from public, anon, authenticated;

-- Ojo: tiene que ser REVOKE UPDATE a nivel de TABLA. Un revoke de columnas
-- específicas no alcanza si el rol ya tiene GRANT ALL de tabla (el default
-- de Supabase en cualquier proyecto nuevo) -- verificado contra la base real,
-- ver detalle en supabase/migrations/20260913000000_fix_revoke_users_update_table_level.sql.
revoke update on public.users from anon, authenticated;
