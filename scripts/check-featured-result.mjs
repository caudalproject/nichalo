// Falla el build si el resultado público destacado de la landing
// (link "Mirá un análisis completo, sin registrarte →" en PricingSection)
// no resuelve para un visitante SIN sesión.
//
// Por qué: el 13/9/2026 ese link daba 404 en producción hacía tiempo sin que
// nadie lo notara — el registro existía, pero RLS bloqueaba a cualquier
// anon. Este check pega contra la REST API de Supabase con la anon key
// (mismo camino que usa /resultado/[id] en runtime), no solo verifica que
// el registro exista en la tabla — así ambas causas del bug quedan cubiertas.
//
// Se corre como "prebuild" (ver package.json). Necesita las mismas env vars
// que el runtime: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.

const FEATURED_RESULT_ID =
  process.env.NEXT_PUBLIC_FEATURED_RESULT_ID || "6d43a024-af07-495a-9926-a2167fa12644";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "[check-featured-result] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no están seteadas — salteando el chequeo (esperado en algunos entornos locales)."
    );
    return;
  }

  const url = `${SUPABASE_URL}/rest/v1/analyses?id=eq.${FEATURED_RESULT_ID}&select=id`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    console.error(
      `[check-featured-result] La consulta a Supabase falló (${res.status}). No se pudo verificar el resultado destacado.`
    );
    process.exit(1);
  }

  const rows = await res.json();

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(
      `[check-featured-result] El resultado destacado de la landing (${FEATURED_RESULT_ID}) no resuelve para un visitante anónimo (RLS lo bloquea o el registro no existe). ` +
        "Arreglá el registro/policy, o cambiá NEXT_PUBLIC_FEATURED_RESULT_ID a un análisis que sí resuelva."
    );
    process.exit(1);
  }

  console.log(
    `[check-featured-result] OK — ${FEATURED_RESULT_ID} resuelve sin sesión.`
  );
}

main().catch((err) => {
  console.error("[check-featured-result] Error inesperado:", err);
  process.exit(1);
});
