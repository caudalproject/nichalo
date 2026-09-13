-- La policy "analyses public select by id" de la migracion anterior
-- (20260913130000) se restringio "to anon", pensando solo en visitantes sin
-- sesion. JP reporto que el mismo link, ABIERTO ESTANDO LOGUEADO (con una
-- cuenta que no es la dueña del analisis), seguia dando 404: el rol ahi es
-- "authenticated", no "anon", y la unica policy que aplicaba a ese rol era
-- "analyses self select" (auth.uid() = user_id), que sigue bloqueando el
-- acceso a un analisis ajeno.
--
-- Fix: la policy publica pasa a "to public" (sin restriccion de rol), que en
-- Postgres/RLS cubre tanto anon como authenticated. "analyses self select"
-- sigue existiendo y no cambia nada para el dashboard del dueño.

drop policy if exists "analyses public select by id" on public.analyses;
create policy "analyses public select by id"
  on public.analyses for select
  using (true);
