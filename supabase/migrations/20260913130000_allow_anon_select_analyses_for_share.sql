-- "Resultado compartible sin login" nunca tuvo respaldo real en RLS: la unica
-- policy de SELECT en analyses exigia auth.uid() = user_id, asi que cualquier
-- visitante anonimo que abriera /resultado/[id] recibia una fila vacia (RLS
-- filtra, no tira error) y la page hacia notFound() -> 404 en produccion.
-- Encontrado al debuggear el link de ejemplo de la landing
-- (6d43a024-af07-495a-9926-a2167fa12644, "Termo Stanley").
--
-- El modelo de producto es compartir por UUID no adivinable (como un link de
-- Google Docs), no por sesion. Se agrega una policy separada para el rol
-- "anon" en vez de tocar "analyses self select", que sigue gobernando el
-- acceso de usuarios logueados a SU propio historial (dashboard).

drop policy if exists "analyses public select by id" on public.analyses;
create policy "analyses public select by id"
  on public.analyses for select
  to anon
  using (true);
