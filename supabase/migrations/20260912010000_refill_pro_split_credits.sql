-- Refill mensual real para Pro, sin pisar los créditos de pack.
--
-- Problema resuelto: `analisis_restantes` era un único entero que servía a
-- la vez de "créditos de pack" (no vencen, comprados) y de "créditos del
-- ciclo de Pro" (se supone que se resetean cada mes). No había ningún
-- mecanismo de recarga real, y el trigger `set_analisis_restantes_on_plan_change`
-- pisaba ese entero a un valor fijo cada vez que `plan` cambiaba — lo que
-- significa que HOY, un Pro con créditos de pack sin usar que cancela la
-- suscripción pierde esos créditos igual, pese a habérselos vendido como
-- "no vencen". Este bug ya vive en producción, no es hipotético.
--
-- Solución: separar en dos columnas.
--   creditos_pack  -> comprados (packs) o el cortesía de Free. No vencen,
--                     nada los resetea salvo consumo explícito.
--   creditos_ciclo -> el cupo mensual de Pro. Se resetea en cada renovación
--                     y se pone en 0 al cancelar/vencer.
-- Al consumir un análisis se gasta primero creditos_ciclo, después
-- creditos_pack. El contador que ve el usuario es la suma de los dos.

-- 1) Columnas nuevas ---------------------------------------------------
alter table public.users
  add column if not exists creditos_ciclo int not null default 0,
  add column if not exists creditos_pack int not null default 0,
  add column if not exists ultimo_refill_at timestamptz;

-- 2) Backfill: los usuarios actuales quedan con EXACTAMENTE los créditos
--    que tienen hoy, sin excepción.
--    - Pro: todo lo que tenían en analisis_restantes venía del mecanismo de
--      overwrite (activación/renovación), que hasta hoy era la única fuente
--      de crédito de un Pro -> va entero a creditos_ciclo. Se marca
--      ultimo_refill_at = now() para que el refill lazy (Tarea 2) no
--      recargue de más el mismo día que se corre esta migración.
--    - Free / starter (sin uso): lo que tengan (cortesía + eventuales packs,
--      hoy indistinguibles) es crédito que no vence -> va a creditos_pack.
update public.users
set
  creditos_ciclo = case when plan = 'pro' then analisis_restantes else 0 end,
  creditos_pack  = case when plan = 'pro' then 0 else analisis_restantes end,
  ultimo_refill_at = case when plan = 'pro' then now() else null end;

-- 3) Fuera el trigger que pisaba créditos en cualquier cambio de plan.
--    Es la causa raíz del bug: un reset ciego a valor fijo no puede convivir
--    con dos orígenes de crédito. De acá en adelante cada transición de
--    plan (alta, renovación, cancelación) se maneja explícitamente con las
--    funciones de abajo, tocando solo el bucket que corresponde.
drop trigger if exists trg_users_plan_change on public.users;
drop function if exists public.set_analisis_restantes_on_plan_change();

-- 4) Alta de usuario: ya no se regala nada acá (el courtesy credit de Free
--    lo sigue otorgando new-user-bootstrap.ts, ahora contra creditos_pack).
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

-- 5) Fuera las RPC viejas, atadas a la columna que desaparece.
drop function if exists public.decrement_analisis_restantes(uuid);
drop function if exists public.increment_analisis_restantes(uuid, int);

-- 6) Columna vieja fuera de la tabla. Todo el código que la usaba se migra
--    en el mismo commit (ver app/api/analizar/route.ts, lib/inngest-functions.ts,
--    app/api/pagos/webhook/route.ts, app/api/pagos/cancelar/route.ts,
--    lib/new-user-bootstrap.ts y los sitios de lectura en app/ y components/).
alter table public.users drop column if exists analisis_restantes;

-- 7) Descuento de un análisis: ciclo primero, pack después. Atómico — una
--    sola sentencia, sin leer-y-escribir desde JS. No hace nada si el
--    usuario no tiene crédito (mismo comportamiento que la RPC vieja).
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

-- 8) Otorgar créditos de pack (compra de Pack 3 / Pack 10, o el courtesy
--    credit de Free). Suma pura, nunca toca creditos_ciclo.
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

-- 9) Activación de Pro (primera vez que el preapproval queda "authorized").
--    Idempotente por diseño: si ya está en plan pro, no hace nada — así una
--    notificación de MP duplicada no vuelve a pisar creditos_ciclo a 30
--    borrando lo ya consumido en el ciclo. No toca creditos_pack.
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

-- 10) Refill del ciclo de un Pro ya activo. Es la ÚNICA función que decide
--     "¿corresponde recargar?" — tanto el webhook (Opción A, camino
--     principal) como el chequeo lazy en /api/analizar (Opción B, red de
--     seguridad) llaman a esta misma función en vez de reimplementar la
--     condición cada uno por su lado. Así, si las dos vías se disparan casi
--     al mismo tiempo, la segunda llamada no hace nada (la condición del
--     WHERE ya no se cumple) — idempotencia real, no por deduplicar
--     eventos sino porque la función es idempotente en sí misma.
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

-- 11) Cancelación / vencimiento de Pro. plan vuelve a free, creditos_ciclo
--     a 0, creditos_pack queda intacto — no negociable.
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

-- 12) Mismo candado que ya se aplicó en 20260912000100 para las RPC viejas:
--     estas funciones solo las debe poder llamar el service role (backend),
--     nunca el cliente con su propia sesión.
revoke execute on function public.descontar_analisis(uuid) from public, anon, authenticated;
revoke execute on function public.incrementar_creditos_pack(uuid, int) from public, anon, authenticated;
revoke execute on function public.activar_pro(uuid) from public, anon, authenticated;
revoke execute on function public.refrescar_ciclo_pro(uuid) from public, anon, authenticated;
revoke execute on function public.cancelar_pro(uuid) from public, anon, authenticated;

-- 13) Hallazgo aparte, mismo commit porque toca la misma tabla: `anon` y
--     `authenticated` tenían GRANT de UPDATE a nivel de columna sobre
--     analisis_restantes (y por ende iban a heredarlo en las columnas
--     nuevas), con una policy de RLS que solo filtra por fila
--     (auth.uid() = id) y no por columna. Eso permitía que cualquier
--     usuario logueado se autoadjudicara créditos con un UPDATE directo vía
--     REST, sin pasar por ninguna RPC. Nadie lo explotó, pero es la misma
--     clase de agujero que ya se cerró para las RPC. Todas las escrituras
--     legítimas de estas columnas pasan por service role o por las
--     funciones de arriba (SECURITY DEFINER) — ningún código de cliente
--     necesita este permiso.
revoke update (plan, creditos_ciclo, creditos_pack, ultimo_refill_at)
  on public.users from anon, authenticated;

-- 14) handle_new_user() es un trigger function (retorna trigger, solo lo
--     puede invocar el motor de triggers), pero por el GRANT default de
--     Postgres queda con EXECUTE abierto a PUBLIC/anon/authenticated —
--     mismo criterio que el resto: el cliente no necesita poder llamarla.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
