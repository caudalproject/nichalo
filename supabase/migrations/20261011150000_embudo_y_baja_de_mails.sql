-- TAB 3.8 (11/10/2026): conversion despues del primer analisis.
--
-- Tres piezas:
--   1. `eventos_embudo`: lo que la base no sabia (vio packs, toco comprar,
--      mails enviados y clickeados). Una fila por usuario + evento + origen:
--      la restriccion UNIQUE es a la vez el "cuenta una vez" del embudo y el
--      candado de idempotencia de los mails (se inserta ANTES de mandar).
--   2. `v_embudo`: registro -> analizo -> vio packs -> toco comprar -> pago,
--      por semana de registro, en una sola consulta.
--   3. Baja de mails: `users.baja_token` (link sin login, sin secreto nuevo
--      en Vercel) y `users.mails_baja_at`.
--
-- `users.es_interna` saca del embudo y de los mails a las cuentas de JP,
-- prueba y familia. Se marca con un UPDATE aparte (no va aca: la lista de
-- mails vive en el vault, no en el repo).

alter table public.users
  add column if not exists baja_token uuid not null default gen_random_uuid(),
  add column if not exists mails_baja_at timestamptz,
  add column if not exists es_interna boolean not null default false;

create unique index if not exists users_baja_token_key on public.users (baja_token);

create table if not exists public.eventos_embudo (
  id bigserial primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  evento text not null check (
    evento in ('vio_packs', 'click_comprar', 'mail_seguimiento', 'mail_click', 'mail_upsell')
  ),
  origen text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, evento, origen)
);

create index if not exists eventos_embudo_evento_idx on public.eventos_embudo (evento, created_at);

-- Solo escribe el servidor (service role). Sin policies = nadie mas lee ni escribe.
alter table public.eventos_embudo enable row level security;
revoke all on public.eventos_embudo from anon, authenticated;
revoke all on sequence public.eventos_embudo_id_seq from anon, authenticated;

-- El embudo. `vio_packs` y `click_comprar` existen desde el 11/10/2026: las
-- cohortes anteriores muestran 0 en esas columnas porque no se media, no
-- porque nadie las viera.
create or replace view public.v_embudo
with (security_invoker = true) as
select
  date_trunc('week', u.created_at at time zone 'America/Argentina/Buenos_Aires')::date as semana,
  count(*) as registros,
  count(*) filter (where exists (select 1 from public.analyses a where a.user_id = u.id)) as analizaron,
  count(*) filter (where exists (select 1 from public.eventos_embudo e where e.user_id = u.id and e.evento = 'vio_packs')) as vieron_packs,
  count(*) filter (where exists (select 1 from public.eventos_embudo e where e.user_id = u.id and e.evento = 'click_comprar')) as tocaron_comprar,
  count(*) filter (
    where exists (select 1 from public.purchases p where p.user_id = u.id)
       or u.mp_preapproval_id is not null
  ) as pagaron,
  count(*) filter (where exists (select 1 from public.eventos_embudo e where e.user_id = u.id and e.evento = 'mail_seguimiento')) as mail_seguimiento,
  count(*) filter (where exists (select 1 from public.eventos_embudo e where e.user_id = u.id and e.evento = 'mail_click')) as mail_click
from public.users u
where not u.es_interna
group by 1
order by 1 desc;

revoke all on public.v_embudo from anon, authenticated;

-- Candidatos al mail de seguimiento: free, en 0, sin compra, sin baja, no
-- interno, que nunca lo recibio, con su PRIMER analisis dentro de la ventana.
-- El producto citado es el del ULTIMO analisis (si hubo reintento por
-- confianza baja, el reintento es el que vale).
create or replace function public.candidatos_mail_seguimiento(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_limite integer default 50
)
returns table (
  user_id uuid,
  email text,
  baja_token uuid,
  primer_analisis_at timestamptz,
  analysis_id uuid,
  producto text,
  veredicto text,
  score integer,
  analisis_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with primeros as (
    select a.user_id, min(a.created_at) as primer
    from analyses a
    group by a.user_id
  )
  select u.id, u.email, u.baja_token, p.primer,
         ult.id, ult.producto, ult.veredicto::text, ult.score, ult.created_at
  from users u
  join primeros p on p.user_id = u.id
  join lateral (
    select a.id, a.producto, a.veredicto, a.score, a.created_at
    from analyses a
    where a.user_id = u.id
    order by a.created_at desc
    limit 1
  ) ult on true
  where u.plan = 'free'
    and coalesce(u.creditos_ciclo, 0) + coalesce(u.creditos_pack, 0) <= 0
    and u.mails_baja_at is null
    and not u.es_interna
    and u.email is not null
    and p.primer >= p_desde
    and p.primer < p_hasta
    and not exists (select 1 from purchases pu where pu.user_id = u.id)
    and not exists (
      select 1 from eventos_embudo e
      where e.user_id = u.id and e.evento = 'mail_seguimiento'
    )
  order by p.primer
  limit p_limite;
$$;

revoke all on function public.candidatos_mail_seguimiento(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.candidatos_mail_seguimiento(timestamptz, timestamptz, integer) to service_role;
