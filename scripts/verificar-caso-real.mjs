/**
 * Verificacion end-to-end de un caso real contra Mercado Libre (24/9/2026).
 *
 * Nace para cerrar el caso `52e064c2` — "Frambuesa liofilizada 20gr" — donde
 * un usuario real recibio "Los datos de este analisis no son confiables" en dos
 * analisis seguidos. Se arreglaron dos cosas (`714e5ac` y `40cbb74`) y el
 * efecto estaba PROYECTADO sobre los ratios guardados, no medido corriendo el
 * pipeline. Esto lo mide.
 *
 * Corre el tramo que decide el cartel — scrape -> relevancia -> unidad ->
 * confianza — y NO llama a Gemini: no hace falta para saber si el cartel
 * aparece, y asi la verificacion no gasta ni un analisis del plan del usuario
 * ni tokens del modelo. El unico costo es la corrida de Apify.
 *
 * Imprime las dos lecturas del MISMO scrape: con la normalizacion de unidad
 * vieja (dividiendo todo pack encontrado) y con la nueva. La diferencia entre
 * las dos columnas es, exactamente, el bug.
 *
 * Uso: npx tsx scripts/verificar-caso-real.mjs "frambuesa liofilizada 20gr"
 */

import { readFileSync } from "node:fs";

for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { startApifyRun, checkApifyRun, getApifyResults } = await import("../lib/apify.ts");
const { filtrarRelevantes } = await import("../lib/relevancia.ts");
const { normalizarUnidadDeVenta, detectarUnidades } = await import("../lib/unidad.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");

const producto = process.argv[2] ?? "frambuesa liofilizada 20gr";
const COSTO = Number(process.argv[3] ?? 9000);

console.log(`\nproducto : ${JSON.stringify(producto)}`);
console.log(`costo    : $${COSTO.toLocaleString("es-AR")}\n`);

process.stdout.write("scrapeando Mercado Libre... ");
const runId = await startApifyRun(producto, "AR", "free");
let estado = "RUNNING";
for (let i = 0; i < 90 && estado !== "SUCCEEDED"; i++) {
  await new Promise(r => setTimeout(r, 4000));
  estado = (await checkApifyRun(runId)).status;
  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(estado)) throw new Error(`Apify: ${estado}`);
}
const scrape = await getApifyResults(runId, producto, "AR", 30);
console.log(`ok — ${scrape.listings.length} publicaciones\n`);

const rel = filtrarRelevantes({ producto, searchKeyword: producto, listings: scrape.listings });
console.log(
  `relevancia: aplicado=${rel.aplicado} vio=${rel.n_descartables} saco=${rel.n_descartados}`
);

/** Reproduce la normalizacion ANTERIOR a 714e5ac: divide sin mirar la consulta. */
function normalizarComoAntes(listings) {
  let ajustados = 0;
  const out = listings.map(l => {
    if (l.price === null || !(l.price > 0)) return l;
    const n = detectarUnidades(l.title);
    if (n <= 1) return l;
    ajustados++;
    return { ...l, price: l.price / n };
  });
  return { listings: out, ajustados };
}

function leer(etiqueta, listings, nota) {
  const precios = listings.map(l => l.price).filter(p => p !== null && p > 0);
  const r = calcularPrecioStats(precios, 0, COSTO, {
    n_descartados: rel.n_descartados,
    n_descartables: rel.n_descartables,
    aplicado: rel.aplicado,
    muestra_descartada: rel.muestra_descartada,
    n_evaluados: scrape.listings.length,
  });
  if (!r) return console.log(`\n${etiqueta}: sin precios validos`);

  const { stats, confianza } = r;
  const cartel =
    confianza.nivel === "baja"
      ? '⚠️  "Los datos de este analisis no son confiables"'
      : confianza.nivel === "media"
        ? 'ℹ️  "Este analisis tiene menos respaldo del habitual"'
        : "✅  sin cartel";

  console.log(`\n── ${etiqueta} ${nota}`);
  console.log(`   min/max      $${Math.round(stats.precio_minimo).toLocaleString("es-AR")} — $${Math.round(stats.precio_maximo).toLocaleString("es-AR")}`);
  console.log(`   mediana      $${Math.round(stats.precio_mediano).toLocaleString("es-AR")}`);
  console.log(`   p90/p10      ${confianza.ratio_p90_p10}`);
  console.log(`   nivel        ${confianza.nivel}`);
  console.log(`   motivos      ${confianza.motivos.join(", ") || "(ninguno)"}`);
  console.log(`   ${cartel}`);
  return confianza;
}

const antes = normalizarComoAntes(rel.listings);
leer("ANTES de 714e5ac", antes.listings, `— dividio ${antes.ajustados}/${rel.listings.length}`);

const ahora = normalizarUnidadDeVenta({ producto, costoLocal: COSTO, listings: rel.listings });
const post = leer(
  "AHORA (en produccion)",
  ahora.listings,
  `— dividio ${ahora.unidad.listings_ajustados}/${rel.listings.length}, base_por_contenido=${ahora.unidad.base_por_contenido}`
);

console.log(
  `\n${post && post.nivel !== "baja" ? "CERRADO: el cartel duro ya no aparece para este producto." : "SIGUE ABIERTO: revisar el techo de la distribucion (relevancia.ts)."}\n`
);
