/**
 * Validacion del score deterministico (TAB 3, 20/9/2026).
 *
 * Hace tres cosas:
 *
 * 1. GOLDEN SET. Scrapea una sola vez cada producto de la lista y guarda el
 *    resultado crudo en scripts/fixtures/. Si el fixture ya existe NO vuelve a
 *    llamar a Apify: el set se paga una vez (~0,002 USD por publicacion) y
 *    despues es gratis para siempre. Esto es lo que no existia el 13/9 y por eso
 *    aquel experimento no se pudo repetir.
 *
 * 2. PRUEBA DE REPRODUCIBILIDAD. Calcula el score dos veces sobre cada fixture,
 *    la segunda con los listings BARAJADOS. Si el orden en que Apify devuelve el
 *    dataset mueve el numero, la formula no es deterministica aunque lo parezca.
 *    Es la prueba que pide el contrato de salida del tab.
 *
 * 3. TABLA DE CALIBRACION. Imprime el desglose de cada producto para poder
 *    discutir los pesos con numeros en la mano y no de memoria.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/validar-score.mjs          (usa fixtures)
 *   npx tsx --env-file=.env.local scripts/validar-score.mjs --scrape (paga y scrapea lo que falte)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const { startApifyRun, checkApifyRun, getApifyResults } = await import("../lib/apify.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");
const { calcularScore } = await import("../lib/score.ts");

const DIR = "scripts/fixtures";
const SCRAPEAR = process.argv.includes("--scrape");

// Diez productos elegidos para cubrir el espacio, no por ser lindos:
// commodity saturado, marca fuerte, nicho chico, caro, barato, y un caso de
// costo roto (el que produjo el ROI de 1283% en "Silla gamer Yeyian").
const SET = [
  { q: "auriculares bluetooth", costo: 9000, perfil: "principiante", nota: "commodity saturado" },
  { q: "airpods pro apple", costo: 250000, perfil: "principiante", nota: "marca fuerte" },
  { q: "termo stanley 473ml", costo: 40000, perfil: "intermedio", nota: "marca + precio alto" },
  { q: "lampara de sal del himalaya", costo: 6000, perfil: "principiante", nota: "nicho chico" },
  { q: "silla gamer ergonomica", costo: 12000, perfil: "principiante", nota: "costo roto a proposito" },
  { q: "organizador de cables escritorio", costo: 3000, perfil: "principiante", nota: "barato, generico" },
  { q: "cepillo de dientes electrico", costo: 15000, perfil: "intermedio", nota: "medido el 18/9" },
  { q: "mancuernas ajustables 20kg", costo: 60000, perfil: "experto", nota: "caro, fitness" },
  { q: "camiseta deportiva dry fit", costo: 5000, perfil: "principiante", nota: "ropa, alta rotacion" },
  { q: "mini lavadora portatil", costo: 45000, perfil: "intermedio", nota: "margen negativo historico" },
];

const slug = (q) => q.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

async function scrapear(q) {
  const runId = await startApifyRun(q, "AR", "free");
  let status = "RUNNING";
  while (status === "RUNNING" || status === "READY") {
    await new Promise((r) => setTimeout(r, 5000));
    ({ status } = await checkApifyRun(runId));
    process.stdout.write(".");
  }
  if (status !== "SUCCEEDED") throw new Error(`run ${status}`);
  return await getApifyResults(runId, q, "AR", 30);
}

function barajar(xs, semilla = 12345) {
  // Shuffle deterministico: la prueba tiene que fallar siempre o nunca, no a veces.
  const a = [...xs];
  let s = semilla;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function evaluar(scrape, costo, perfil, producto) {
  const precios = scrape.listings.map((l) => l.price).filter((p) => p != null && p > 0);
  const conVentas = scrape.listings.filter((l) => (l.soldQuantity ?? 0) > 0).length;
  const calc = calcularPrecioStats(precios, conVentas, costo);
  if (!calc) return null;
  return calcularScore({
    producto,
    pais: "AR",
    perfil,
    costoLocal: costo,
    listings: scrape.listings,
    stats: calc.stats,
    confianza: calc.confianza,
  });
}

let fallos = 0;
const filas = [];

for (const caso of SET) {
  const ruta = join(DIR, `${slug(caso.q)}.json`);
  let scrape;

  if (existsSync(ruta)) {
    scrape = JSON.parse(readFileSync(ruta, "utf8"));
  } else if (SCRAPEAR) {
    process.stdout.write(`scrapeando ${caso.q} `);
    scrape = await scrapear(caso.q);
    writeFileSync(ruta, JSON.stringify(scrape, null, 2));
    console.log(` ${scrape.totalListings} publicaciones`);
  } else {
    console.log(`(falta fixture: ${caso.q} — corré con --scrape)`);
    continue;
  }

  const a = evaluar(scrape, caso.costo, caso.perfil, caso.q);
  const b = evaluar(
    { ...scrape, listings: barajar(scrape.listings) },
    caso.costo,
    caso.perfil,
    caso.q
  );

  if (!a || !b) {
    console.log(`SIN PRECIOS: ${caso.q}`);
    continue;
  }

  const igual = JSON.stringify(a) === JSON.stringify(b);
  if (!igual) {
    fallos++;
    console.log(`\n✗ NO REPRODUCIBLE: ${caso.q} → ${a.score} vs ${b.score} (listings barajados)`);
  }

  filas.push({ caso, s: a, igual });
}

console.log("\n=== SCORES ===\n");
for (const { caso, s, igual } of filas) {
  console.log(
    `${igual ? "✓" : "✗"} ${caso.q}  →  ${s.score}  ${s.veredicto}   [${caso.nota}]`
  );
  console.log(
    `   n=${s.metricas.n_listings} vendedores=${s.metricas.vendedores_unicos} ` +
      `conVentas=${s.metricas.listings_con_ventas} reviews5+baratas=${s.metricas.reviews_mediana_baratos} ` +
      `spread=${s.metricas.spread_p90_p50?.toFixed(2)} envioGratis=${Math.round(s.metricas.pct_envio_gratis * 100)}%`
  );
  console.log(`   precio=${s.precio_sugerido} margen=${s.margen_neto_pct}% bruto=${s.score_bruto}`);
  for (const c of s.componentes) console.log(`   · ${c.nombre}: ${c.puntos}/${c.maximo} — ${c.metrica}`);
  for (const o of s.omitidos) console.log(`   · (omitido) ${o.nombre}: ${o.motivo}`);
  console.log("");
}

console.log(
  fallos === 0
    ? `REPRODUCIBILIDAD: ${filas.length}/${filas.length} productos dan el mismo score con los listings barajados.`
    : `REPRODUCIBILIDAD: ${fallos} FALLO(S).`
);
process.exit(fallos === 0 ? 0 : 1);
