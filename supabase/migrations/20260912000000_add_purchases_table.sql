-- Compras de packs de créditos (pago único, sin vencimiento).
-- Los packs NO cambian el plan del usuario: solo suman a analisis_restantes.
-- Fuente de verdad de precios/créditos: PACKS en lib/mercadopago.ts.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  pack text not null check (pack in ('pack_3', 'pack_10')),
  monto_ars integer not null,
  mp_payment_id text not null unique,
  creditos_otorgados integer not null,
  created_at timestamptz not null default now()
);

-- El unique de mp_payment_id es la idempotencia contra reintentos del
-- webhook de Mercado Pago: si el insert choca, el pago ya fue procesado y
-- no hay que volver a otorgar créditos.

alter table public.purchases enable row level security;

create policy "Users can read own purchases"
  on public.purchases for select
  using (auth.uid() = user_id);

-- Sin policy de insert/update/delete: las filas las crea únicamente el
-- webhook con el service role (bypassea RLS). anon y authenticated no
-- pueden escribir en esta tabla.

-- Incremento atómico de créditos. Evita el race condition de leer
-- analisis_restantes en JS, sumarle N, y volver a escribir.
create or replace function public.increment_analisis_restantes(
  user_id_param uuid,
  amount_param int
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set analisis_restantes = analisis_restantes + amount_param
  where id = user_id_param;
$$;
