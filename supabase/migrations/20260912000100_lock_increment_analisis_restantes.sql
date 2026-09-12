-- increment_analisis_restantes quedó ejecutable por anon/authenticated vía
-- PostgREST RPC (grant default a PUBLIC en funciones SECURITY DEFINER).
-- Cualquier usuario logueado podría haberse otorgado créditos infinitos
-- llamando /rest/v1/rpc/increment_analisis_restantes con su propio user_id.
-- Solo el webhook (service role) debe poder otorgar créditos de un pack.
revoke execute on function public.increment_analisis_restantes(uuid, int) from public;
revoke execute on function public.increment_analisis_restantes(uuid, int) from anon;
revoke execute on function public.increment_analisis_restantes(uuid, int) from authenticated;
