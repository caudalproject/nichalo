-- TAB 8 (11/10/2026): "Donde conseguir este producto".
--
-- Dos eventos nuevos en `eventos_embudo` (misma tabla del TAB 3.8, mismo
-- "una fila por usuario + evento + origen"):
--   - vio_proveedores  origen = <categoria>              (el bloque entro en pantalla)
--   - click_proveedor  origen = <categoria>:<proveedor>  (toco un link)
--
-- El contrato del tab: medir 4 semanas y decidir el marketplace de
-- proveedores con este numero, no antes. Lectura:
--   select * from v_proveedores;

alter table public.eventos_embudo drop constraint if exists eventos_embudo_evento_check;
alter table public.eventos_embudo add constraint eventos_embudo_evento_check check (
  evento in (
    'vio_packs', 'click_comprar', 'mail_seguimiento', 'mail_click', 'mail_upsell',
    'vio_proveedores', 'click_proveedor'
  )
);

-- Por categoria y proveedor: cuantos usuarios (externos) vieron el bloque en
-- esa categoria y cuantos tocaron cada link. Usuarios distintos, no clicks:
-- la UNIQUE ya cuenta a cada uno una vez.
create or replace view public.v_proveedores
with (security_invoker = true) as
with ev as (
  select e.*
  from public.eventos_embudo e
  join public.users u on u.id = e.user_id
  where not u.es_interna
    and e.evento in ('vio_proveedores', 'click_proveedor')
),
vistas as (
  select origen as categoria, count(distinct user_id) as vieron
  from ev where evento = 'vio_proveedores'
  group by 1
),
clicks as (
  select split_part(origen, ':', 1) as categoria,
         split_part(origen, ':', 2) as proveedor,
         count(distinct user_id) as clickearon,
         min(created_at) as primer_click,
         max(created_at) as ultimo_click
  from ev where evento = 'click_proveedor'
  group by 1, 2
)
select coalesce(c.categoria, v.categoria) as categoria,
       c.proveedor,
       coalesce(v.vieron, 0) as vieron_bloque,
       coalesce(c.clickearon, 0) as clickearon,
       c.primer_click,
       c.ultimo_click
from vistas v
full join clicks c on c.categoria = v.categoria
order by 1, clickearon desc;

revoke all on public.v_proveedores from anon, authenticated;
