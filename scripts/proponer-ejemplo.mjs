// Valida un analisis candidato para ser el ejemplo destacado de la landing y
// emite el bloque EJEMPLO_LANDING listo para pegar en lib/ejemplo-landing.ts.
//
// Por que existe: el 21/9 se detecto que el destacado de la landing
// (3ac26d02, "Camiseta deportiva talle unico") renderizaba con confianza BAJA.
// Su costo (2,77 USD = $3.995 ARS) contra el precio sugerido ($30.602) da un
// markup de 7,66x, por encima del MARKUP_IMPLAUSIBLE de 6 de lib/confianza.ts.
// Resultado: la vidriera de la landing mostraba el cartel ambar
// "el costo que ingresaste es muy bajo..." y tapaba el ROI con un guion.
//
// Elegir el proximo destacado a ojo repite el error, porque el umbral no se ve
// mirando la pagina: hay que dividir dos numeros que estan en unidades
// distintas (el costo en USD, el precio sugerido en moneda local).
//
// Uso:
//   node scripts/proponer-ejemplo.mjs <id-del-analisis>
//   node scripts/proponer-ejemplo.mjs --listar     (candidatos que pasan todo)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Mismos valores que lib/confianza.ts. Si alla cambian, cambian aca.
const MARKUP_IMPLAUSIBLE = 6;
const DISPERSION_MEDIA_HEREDADA = 10;
const DISPERSION_BAJA_HEREDADA = 20;

const FALLBACK_RATES = { ARS: 1400, MXN: 17, COP: 4200 };

const ars = (n) =>
  "$ " + Math.round(n).toLocaleString("es-AR", { useGrouping: true });
const pct = (n) => n.toFixed(1).replace(".", ",") + "%";

function evaluar(row) {
  const j = row.resultado_json ?? {};
  const comp = j.competencia ?? {};
  const margen = j.margen ?? {};

  const moneda = j.moneda ?? "ARS";
  const tasa = j.tasa_cambio ?? FALLBACK_RATES[moneda] ?? 1400;
  const costoUsd = Number(row.costo_estimado);
  const costoLocal = costoUsd * tasa;

  const precioSugerido = Number(margen.precio_sugerido_venta ?? 0);
  const precioVentaUsd = tasa > 0 ? precioSugerido / tasa : precioSugerido;
  const comisionUsd = j.comision_detalle?.monto_usd ?? margen.comision_ml_estimada ?? 0;
  const gananciaUsd = precioVentaUsd - costoUsd - comisionUsd;

  const margenBruto = precioVentaUsd > 0 ? (gananciaUsd / precioVentaUsd) * 100 : 0;
  const roi = costoUsd > 0 ? (gananciaUsd / costoUsd) * 100 : 0;

  const pmin = Number(comp.precio_minimo ?? 0);
  const pmax = Number(comp.precio_maximo ?? 0);

  const markup = costoLocal > 0 ? precioSugerido / costoLocal : Infinity;
  const dispersion = pmin > 0 ? pmax / pmin : Infinity;

  const problemas = [];
  if (!(costoUsd > 0)) problemas.push("costo_estimado vacio o cero");
  if (!(precioSugerido > 0)) problemas.push("precio_sugerido_venta vacio");
  if (markup > MARKUP_IMPLAUSIBLE)
    problemas.push(
      `markup ${markup.toFixed(2)}x > ${MARKUP_IMPLAUSIBLE}x -> confianza BAJA, sale el cartel "el costo que ingresaste es muy bajo" y el ROI se tapa con un guion`
    );
  if (dispersion > DISPERSION_BAJA_HEREDADA)
    problemas.push(`dispersion ${dispersion.toFixed(2)}x > ${DISPERSION_BAJA_HEREDADA}x -> confianza BAJA por precios mezclados`);
  else if (dispersion > DISPERSION_MEDIA_HEREDADA)
    problemas.push(`dispersion ${dispersion.toFixed(2)}x > ${DISPERSION_MEDIA_HEREDADA}x -> confianza MEDIA, sale una nota de precios mezclados (no tapa numeros)`);
  if (gananciaUsd <= 0) problemas.push(`ganancia negativa (${gananciaUsd.toFixed(2)} USD) — revisar unidades de la comision`);
  if (margenBruto > 90) problemas.push(`margen ${margenBruto.toFixed(1)}% inverosimil para la vidriera`);
  if (!j.score_detalle) problemas.push("sin score_detalle -> el bloque de desglose no renderiza (hace falta para el video)");

  return { j, comp, margen, moneda, tasa, costoUsd, costoLocal, precioSugerido,
           comisionUsd, gananciaUsd, margenBruto, roi, pmin, pmax, markup,
           dispersion, problemas };
}

function emitirBloque(row, e) {
  const dist = (e.comp.distribucion_precios ?? [])
    .map((d) => `    { rango: ${JSON.stringify(d.rango)}, cantidad: ${d.cantidad} },`)
    .join("\n");
  const riesgos = (e.j.riesgos ?? [])
    .slice(0, 2)
    .map((r) => `    ${JSON.stringify(r)},`)
    .join("\n");

  return `export const EJEMPLO_LANDING = {
  producto: ${JSON.stringify(row.producto)},
  pais: "Argentina",
  score: ${row.score},
  veredicto: ${JSON.stringify(row.veredicto)},
  publicacionesAnalizadas: ${e.j.publicaciones_analizadas ?? 30},

  precioPromedio: ${JSON.stringify(ars(e.comp.precio_promedio ?? 0))},
  precioMinimo: ${JSON.stringify(ars(e.pmin))},
  precioMaximo: ${JSON.stringify(ars(e.pmax))},

  costo: ${JSON.stringify(ars(e.costoLocal))},
  precioSugerido: ${JSON.stringify(ars(e.precioSugerido))},
  comisionMl: ${JSON.stringify(ars(e.comisionUsd * e.tasa))},
  ganancia: ${JSON.stringify(ars(e.gananciaUsd * e.tasa))},
  margenPorcentaje: ${JSON.stringify(pct(e.margenBruto))},

  resumen:
    ${JSON.stringify((e.j.resumen ?? "").split(". ")[0] + ".")},

  riesgos: [
${riesgos}
  ],

  distribucion: [
${dist}
  ],
} as const;`;
}

async function traer(filtro) {
  const url = `${SUPABASE_URL}/rest/v1/analyses?${filtro}&select=id,producto,pais,score,veredicto,costo_estimado,created_at,resultado_json`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) {
    console.error(`[proponer-ejemplo] Supabase respondio ${res.status}.`);
    process.exit(1);
  }
  return res.json();
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[proponer-ejemplo] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(1);
  }

  const arg = process.argv[2];

  if (!arg || arg === "--listar") {
    const rows = await traer("order=created_at.desc&limit=60");
    console.log(`\nCandidatos (${rows.length} analisis visibles para un anonimo):\n`);
    for (const row of rows) {
      const e = evaluar(row);
      const bloqueantes = e.problemas.filter((p) => !p.startsWith("sin score_detalle"));
      const marca = bloqueantes.length === 0 ? "OK  " : "NO  ";
      console.log(
        `${marca} ${String(row.score).padStart(3)} ${row.veredicto.padEnd(9)} markup ${e.markup.toFixed(2).padStart(7)}x  disp ${e.dispersion.toFixed(1).padStart(6)}x  margen ${e.margenBruto.toFixed(1).padStart(6)}%  ${row.producto.slice(0, 38)}`
      );
      console.log(`     ${row.id}  ${row.created_at.slice(0, 10)}`);
      for (const p of e.problemas) console.log(`       - ${p}`);
    }
    console.log("\nOK = pasa los umbrales de confianza. Igual hace falta score_detalle para el desglose.\n");
    return;
  }

  const rows = await traer(`id=eq.${arg}`);
  if (!rows.length) {
    console.error(
      `[proponer-ejemplo] ${arg} no resuelve para un visitante anonimo (RLS lo bloquea o no existe).\n` +
      "Es el mismo modo de falla que el link roto del 13/9: el registro puede existir y aun asi dar 404 sin sesion."
    );
    process.exit(1);
  }

  const row = rows[0];
  const e = evaluar(row);

  console.log(`\n=== ${row.producto} — ${row.created_at.slice(0, 10)} ===`);
  console.log(`id           ${row.id}`);
  console.log(`score        ${row.score} ${row.veredicto}  ·  ${e.j.publicaciones_analizadas ?? "?"} publicaciones`);
  console.log(`precios      min ${ars(e.pmin)} · prom ${ars(e.comp.precio_promedio ?? 0)} · max ${ars(e.pmax)}`);
  console.log(`costo        ${e.costoUsd} USD = ${ars(e.costoLocal)}  (tasa ${e.tasa})`);
  console.log(`markup       ${e.markup.toFixed(2)}x   (umbral ${MARKUP_IMPLAUSIBLE}x)`);
  console.log(`dispersion   ${e.dispersion.toFixed(2)}x   (umbrales ${DISPERSION_MEDIA_HEREDADA}x / ${DISPERSION_BAJA_HEREDADA}x)`);
  console.log(`margen       ${pct(e.margenBruto)}   ·   ROI ${pct(e.roi)}`);

  if (e.problemas.length) {
    console.log(`\n⚠️  Problemas:`);
    for (const p of e.problemas) console.log(`   - ${p}`);
  } else {
    console.log(`\n✅ Pasa todos los umbrales. La pagina lo muestra sin avisos y con el ROI visible.`);
  }

  const bloqueantes = e.problemas.filter((p) => !p.startsWith("sin score_detalle"));
  if (bloqueantes.length === 0) {
    console.log(`\n--- Pegar en lib/ejemplo-landing.ts (reemplaza EJEMPLO_LANDING) ---\n`);
    console.log(emitirBloque(row, e));
    console.log(`\n--- Y setear en Vercel ---\nNEXT_PUBLIC_FEATURED_RESULT_ID=${row.id}\n`);
    console.log(`Despues: npm run build  (el prebuild valida que todo coincida)\n`);
  } else {
    console.log(`\nNo emito el bloque: primero hay que resolver lo de arriba.\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
