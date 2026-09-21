/**
 * Render offline del bloque "De qué se compone el score" (TAB 4, 21/9/2026).
 *
 * POR QUE EXISTE
 *
 * El bloque lee `resultado_json.score_detalle`, que solo escriben los analisis
 * corridos DESPUES del TAB 3 (20/9). Al desplegar el TAB 4 no habia ni un
 * analisis con ese campo en la base — el mas nuevo era del 18/9 — asi que el
 * componente estaba desplegado sin haber renderizado nunca contra datos reales.
 * Verificarlo corriendo un analisis de verdad cuesta plata y un credito.
 *
 * Esto lo renderiza contra el golden set del TAB 3 (scripts/fixtures/), que es
 * scrape real de Mercado Libre, y escribe un HTML para abrir en el browser y en
 * el iPhone. Cubre los tres casos que importan: componentes con datos,
 * componentes omitidos por falta de dato, y techo aplicado.
 *
 * Uso:  npx tsx scripts/render-desglose.mjs   → /tmp/desglose.html
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as React from "react";

// Fuera de Next, tsx compila el JSX con el runtime "classic", que emite
// React.createElement y espera un `React` en scope. El componente no importa
// React porque dentro de Next corre con el runtime automatico.
globalThis.React = React;

const { calcularPrecioStats } = await import("../lib/confianza.ts");
const { calcularScore } = await import("../lib/score.ts");
const { DesgloseScore } = await import("../components/DesgloseScore.tsx");

const DIR = "scripts/fixtures";

// Mismos costos y perfiles que scripts/validar-score.mjs: si este render usara
// otros, estaria verificando la UI contra un score que nadie calibro.
const SET = [
  { q: "auriculares bluetooth", costo: 9000, perfil: "principiante" },
  { q: "airpods pro apple", costo: 250000, perfil: "principiante" },
  { q: "termo stanley 473ml", costo: 40000, perfil: "intermedio" },
  { q: "lampara de sal del himalaya", costo: 6000, perfil: "principiante" },
  { q: "silla gamer ergonomica", costo: 12000, perfil: "principiante" },
  { q: "organizador de cables escritorio", costo: 3000, perfil: "principiante" },
  { q: "cepillo de dientes electrico", costo: 15000, perfil: "intermedio" },
  { q: "mancuernas ajustables 20kg", costo: 60000, perfil: "experto" },
  { q: "camiseta deportiva dry fit", costo: 5000, perfil: "principiante" },
  { q: "mini lavadora portatil", costo: 45000, perfil: "intermedio" },
];

const slug = (q) => q.replace(/\s+/g, "-");

const partes = [];
let conOmitidos = 0;
let conTecho = 0;

for (const caso of SET) {
  const fx = JSON.parse(readFileSync(join(DIR, `${slug(caso.q)}.json`), "utf8"));

  const precios = fx.listings.map((l) => l.price).filter((p) => p != null && p > 0);
  const conVentas = fx.listings.filter((l) => (l.soldQuantity ?? 0) > 0).length;
  // OJO: devuelve { stats, confianza }, no stats. Pasar el objeto entero como
  // `stats` deja precioSugerido en undefined y da 20 en los diez productos.
  const calc = calcularPrecioStats(precios, conVentas, caso.costo);
  if (!calc) {
    console.log(`  saltado ${caso.q}: sin precios utilizables`);
    continue;
  }

  const s = calcularScore({
    producto: caso.q,
    pais: "AR",
    perfil: caso.perfil,
    costoLocal: caso.costo,
    listings: fx.listings,
    stats: calc.stats,
    confianza: calc.confianza,
  });

  const detalle = {
    formula: s.formula,
    score_bruto: s.score_bruto,
    puntos_obtenidos: s.puntos_obtenidos,
    puntos_posibles: s.puntos_posibles,
    componentes: s.componentes,
    omitidos: s.omitidos,
    techo_aplicado: s.techo_aplicado,
    motivo_techo: s.motivo_techo,
  };

  if (s.omitidos.length > 0) conOmitidos++;
  if (s.techo_aplicado != null) conTecho++;

  console.log(
    `  ${caso.q.padEnd(34)} score ${String(s.score).padStart(3)}  ` +
      `${s.componentes.length} comp, ${s.omitidos.length} omitidos` +
      (s.techo_aplicado != null ? `, techo ${s.techo_aplicado}` : "")
  );

  partes.push(
    `<h3 style="font:600 13px system-ui;color:#6B7280;margin:28px 0 8px">${caso.q} (${caso.perfil}) — score ${s.score}</h3>` +
      renderToStaticMarkup(createElement(DesgloseScore, { detalle, score: s.score }))
  );
}

// Caso borde que ningun fixture produce: analisis viejo, sin desglose.
const vacio = renderToStaticMarkup(createElement(DesgloseScore, { detalle: null, score: 65 }));
console.log(`\n  detalle null (analisis pre-20/9) renderiza: ${vacio === "" ? "nada ✓" : "ALGO ✗ -> " + vacio.slice(0, 80)}`);

writeFileSync(
  "/tmp/desglose.html",
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desglose del score — TAB 4</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-gray-100 p-4"><div class="mx-auto max-w-3xl">${partes.join("")}</div></body></html>`
);

console.log(`\n  ${partes.length} productos renderizados · ${conOmitidos} con componentes omitidos · ${conTecho} con techo`);
console.log("  -> /tmp/desglose.html");
