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
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  plan plan_tier not null default 'free',
  analisis_restantes int not null default 1,
  created_at timestamptz not null default now()
);

-- Ensure analisis_restantes auto-resets when the plan changes
create or replace function public.set_analisis_restantes_on_plan_change()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan then
    new.analisis_restantes := case new.plan
      when 'free' then 1
      when 'starter' then 10
      when 'pro' then 30
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_plan_change on public.users;
create trigger trg_users_plan_change
before update on public.users
for each row execute function public.set_analisis_restantes_on_plan_change();

-- 3) Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, plan, analisis_restantes)
  values (new.id, new.email, 'free', 1)
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

drop policy if exists "analyses self insert" on public.analyses;
create policy "analyses self insert"
  on public.analyses for insert
  with check (auth.uid() = user_id);
