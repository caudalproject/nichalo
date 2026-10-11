import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Bypasses RLS — only use server-side (Inngest functions, route handlers,
// server components).
//
// `cache: "no-store"` (TAB 3.8, 11/10/2026): Next 14 parchea `fetch` y, dentro
// de un server component, cacheaba las respuestas de PostgREST aunque la
// pagina fuera `force-dynamic`. Medido en produccion: /unsubscribe seguia
// mostrando "¿Darte de baja?" despues de guardada la baja, porque reusaba la
// lectura del primer GET. Una lectura con service role nunca debe salir de cache.
export function createSupabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
