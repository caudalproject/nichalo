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
 * 4. TABLA DE VEREDICTOS QUE CAMBIAN (TAB 3.6). Con --comparar-con=<ref de git>
 *    corre tambien la formula de ese commit sobre los mismos fixtures y
 *    muestra que scores y veredictos se movieron y por que bloque.
 *
 * Fixtures con detalle (TAB 3.6): los `*-detalle.json` traen ademas `ventas`
 * (las 10 paginas de detalle reales del paso 0, ver
 * scripts/crear-fixtures-detalle.mjs). Son los unicos que prueban el bloque C:
 * los 10 originales son de modo listado y no tienen vendidos.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/validar-score.mjs          (usa fixtures)
 *   npx tsx --env-file=.env.local scripts/validar-score.mjs --scrape (paga y scrapea lo que falte)
 *   npx tsx --env-file=.env.local scripts/validar-score.mjs --comparar-con=HEAD
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const { startApifyRun, checkApifyRun, getApifyResults } = await import("../lib/apify.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");
const { calcularScore } = await import("../lib/score.ts");
const { resumirVentas } = await import("../lib/ventas.ts");

// Formula anterior, para la tabla de cambios. Se extrae de git a un archivo
// temporal al lado del original (asi resuelve los mismos imports relativos).
const REF = process.argv.find((a) => a.startsWith("--comparar-con="))?.split("=")[1];
let calcularScoreAnterior = null;
const TMP_ANTERIOR = "lib/.score-anterior.tmp.ts";
if (REF) {
  writeFileSync(TMP_ANTERIOR, execSync(`git show ${REF}:lib/score.ts`));
  try {
    ({ calcularScore: calcularScoreAnterior } = await import(`../${TMP_ANTERIOR}`));
  } finally {
    unlinkSync(TMP_ANTERIOR);
  }
}

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
  // TAB 3.6 — con las 10 paginas de detalle reales del paso 0 (11/10).
  { q: "escurridor vajilla 2 niveles", costo: 12000, perfil: "principiante", nota: "detalle: hogar generico", archivo: "escurridor-vajilla-2-niveles-detalle" },
  { q: "jbl go4 generico", costo: 15000, perfil: "principiante", nota: "detalle: 8 de 9 catalogo", archivo: "jbl-go4-generico-detalle" },
  { q: "tabla de pilates plegable", costo: 30000, perfil: "principiante", nota: "detalle: deporte", archivo: "tabla-de-pilates-plegable-detalle" },
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

function evaluar(scrape, costo, perfil, producto, fn = calcularScore) {
  const precios = scrape.listings.map((l) => l.price).filter((p) => p != null && p > 0);
  // Igual que produccion desde el 3.6: productos distintos que publican ventas.
  const conVentas = scrape.ventas?.estado === "ok" ? resumirVentas(scrape.ventas.productos).medidos : 0;
  const calc = calcularPrecioStats(precios, conVentas, costo);
  if (!calc) return null;
  return fn({
    producto,
    pais: "AR",
    perfil,
    costoLocal: costo,
    listings: scrape.listings,
    stats: calc.stats,
    confianza: calc.confianza,
    // Analisis inicial: siempre consulta ventas. Sin detalle en el fixture,
    // simula una consulta que no devolvio nada (el bloque C se omite).
    ventas: scrape.ventas ?? { estado: "omitido", motivo: "fixture de modo listado, sin detalle", pedidas: 0, productos: [] },
  });
}

let fallos = 0;
const filas = [];

for (const caso of SET) {
  const ruta = join(DIR, `${caso.archivo ?? slug(caso.q)}.json`);
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
    {
      ...scrape,
      listings: barajar(scrape.listings),
      ventas: scrape.ventas ? { ...scrape.ventas, productos: barajar(scrape.ventas.productos, 777) } : undefined,
    },
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

  const antes = calcularScoreAnterior ? evaluar(scrape, caso.costo, caso.perfil, caso.q, calcularScoreAnterior) : null;
  filas.push({ caso, s: a, igual, antes });
}

console.log("\n=== SCORES ===\n");
for (const { caso, s, igual } of filas) {
  console.log(
    `${igual ? "✓" : "✗"} ${caso.q}  →  ${s.score}  ${s.veredicto}   [${caso.nota}]`
  );
  console.log(
    `   n=${s.metricas.n_listings} vendedores=${s.metricas.vendedores_unicos} ` +
      `ventasMedidos=${s.metricas.ventas_productos_medidos} con+100=${s.metricas.ventas_pct_100 == null ? null : Math.round(s.metricas.ventas_pct_100 * 100) + "%"} ` +
      `escalonMax=${s.metricas.ventas_escalon_max} reviews5+baratas=${s.metricas.reviews_mediana_baratos} ` +
      `spread=${s.metricas.spread_p90_p50?.toFixed(2)} envioGratis=${Math.round(s.metricas.pct_envio_gratis * 100)}%`
  );
  console.log(`   precio=${s.precio_sugerido} margen=${s.margen_neto_pct}% bruto=${s.score_bruto}`);
  for (const c of s.componentes) console.log(`   · ${c.nombre}: ${c.puntos}/${c.maximo} — ${c.metrica}`);
  for (const o of s.omitidos) console.log(`   · (omitido) ${o.nombre}: ${o.motivo}`);
  console.log("");
}

if (calcularScoreAnterior) {
  console.log(`=== QUE CAMBIA CONTRA ${REF} ===\n`);
  console.log("producto                         antes            ahora            bloques que cambian");
  for (const { caso, s, antes } of filas) {
    if (!antes) continue;
    const ids = new Set([...antes.componentes, ...s.componentes].map((c) => c.id));
    const mov = [...ids]
      .map((id) => {
        const x = antes.componentes.find((c) => c.id === id);
        const y = s.componentes.find((c) => c.id === id);
        if (x && y && x.puntos === y.puntos) return null;
        return `${id} ${x ? x.puntos : "omitido"}→${y ? y.puntos : "omitido"}`;
      })
      .filter(Boolean);
    const marca = antes.veredicto !== s.veredicto ? "  ◀ CAMBIA VEREDICTO" : "";
    console.log(
      `${caso.q.padEnd(32)} ${String(antes.score).padStart(3)} ${antes.veredicto.padEnd(9)}    ${String(s.score).padStart(3)} ${s.veredicto.padEnd(9)}    ${mov.join(", ") || "—"}${marca}`
    );
  }
  console.log("");
}

console.log(
  fallos === 0
    ? `REPRODUCIBILIDAD: ${filas.length}/${filas.length} productos dan el mismo score con los listings barajados.`
    : `REPRODUCIBILIDAD: ${fallos} FALLO(S).`
);
process.exit(fallos === 0 ? 0 : 1);
