-- El trigger handle_new_user() regalaba analisis_restantes = 1 hardcodeado
-- en cada signup, puenteando por completo el anti-fraude de
-- free_credit_claims (que corre despues, en app/auth/callback y
-- app/api/auth/post-login). El credito ahora lo otorga exclusivamente ese
-- codigo, tras pasar el chequeo de fingerprint.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.users (id, email, plan, analisis_restantes)
  values (new.id, new.email, 'free', 0)
  on conflict (id) do nothing;
  return new;
end;
$function$;
