-- Reemplaza el heuristico de "usuario nuevo = creado hace menos de 10s"
-- (poco confiable para OTP, donde el usuario tarda en tipear el codigo) por
-- un flag que se reclama atomicamente una sola vez por usuario.
alter table public.users add column if not exists credit_bootstrap_done boolean not null default false;

-- Backfill: todo usuario que ya existia antes de este cambio queda marcado
-- como ya bootstrapeado, para que su proximo login no dispare de nuevo el
-- welcome email ni el otorgamiento de credito.
update public.users set credit_bootstrap_done = true where credit_bootstrap_done = false;
