// Falla el build si el resultado público destacado de la landing
// (link "Mirá un análisis real, sin registrarte →" en PricingSection y en la
// sección #ejemplo) no resuelve para un visitante SIN sesión, O si los
// valores hardcodeados en lib/ejemplo-real.ts dejaron de coincidir con el
// registro real.
//
// Por qué: el 13/9/2026 ese link daba 404 en producción hacía tiempo sin que
// nadie lo notara — el registro existía, pero RLS bloqueaba a cualquier
// anon. Este check pega contra la REST API de Supabase con la anon key
// (mismo camino que usa /resultado/[id] en runtime), no solo verifica que
// el registro exista en la tabla — así ambas causas del bug quedan cubiertas.
//
// Desde el rediseño del 14/9 la landing además MUESTRA los números de ese
// análisis (score, veredicto, publicaciones, precios) copiados a mano en
// lib/ejemplo-real.ts. Si alguien rota NEXT_PUBLIC_FEATURED_RESULT_ID sin
// actualizar esos valores, la landing mostraría un análisis y el link
// llevaría a otro distinto — exactamente el tipo de mentira silenciosa que
// este rediseño vino a sacar. Por eso el check también compara.
//
// Se corre como "prebuild" (ver package.json). Necesita las mismas env vars
// que el runtime: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.

const FEATURED_RESULT_ID =
  process.env.NEXT_PUBLIC_FEATURED_RESULT_ID || "3ac26d02-3530-4178-8680-a5245635c62b";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "[check-featured-result] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no están seteadas — salteando el chequeo (esperado en algunos entornos locales)."
    );
    return;
  }

  const url = `${SUPABASE_URL}/rest/v1/analyses?id=eq.${FEATURED_RESULT_ID}&select=id,producto,score,veredicto,resultado_json`;

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

  // Los valores que la landing muestra, copiados de lib/ejemplo-real.ts.
  // Se duplican acá a propósito: este script es .mjs y corre antes del build,
  // sin el resolver de paths de TypeScript. La duplicación es el punto — si
  // divergen, el build frena.
  const ESPERADO = {
    producto: "Camiseta deportiva talle único",
    score: 80,
    veredicto: "VIABLE",
    publicaciones_analizadas: 60,
    precio_promedio: 29891,
  };

  const row = rows[0];
  const real = {
    producto: row.producto,
    score: row.score,
    veredicto: row.veredicto,
    publicaciones_analizadas: row.resultado_json?.publicaciones_analizadas,
    precio_promedio: row.resultado_json?.competencia?.precio_promedio,
  };

  const diffs = Object.keys(ESPERADO).filter(
    (k) => String(ESPERADO[k]) !== String(real[k])
  );

  if (diffs.length > 0) {
    console.error(
      `[check-featured-result] El análisis destacado (${FEATURED_RESULT_ID}) ya no coincide con lo que la landing muestra.`
    );
    for (const k of diffs) {
      console.error(`  - ${k}: landing dice "${ESPERADO[k]}", la base dice "${real[k]}"`);
    }
    console.error(
      "  Actualizá lib/ejemplo-real.ts (y el bloque ESPERADO de este script) con los valores reales."
    );
    process.exit(1);
  }

  console.log(
    `[check-featured-result] OK — ${FEATURED_RESULT_ID} resuelve sin sesión y coincide con lib/ejemplo-real.ts.`
  );
}

main().catch((err) => {
  console.error("[check-featured-result] Error inesperado:", err);
  process.exit(1);
});
