/**
 * Prueba de la regla de silencio del mail semanal (TAB 5.1, 23/9/2026).
 *
 * Lo que se prueba aca NO es que el mail se mande: es que NO se mande.
 *
 * El riesgo de esta feature no es tecnico, es de atencion. Un mail semanal que
 * dice "no cambio nada" entrena al usuario a archivarlo sin abrir, y despues el
 * unico que importaba — entraron 12 vendedores, el precio se cayo 20% — llega
 * al mismo lugar. Por eso la mitad de los casos de abajo esperan `false`.
 *
 * Uso: npx tsx scripts/validar-notificacion.mjs
 */

const { decidirNotificacion, filasDelMail, DIAS_RESUMEN } = await import(
  "../lib/regla-notificacion.ts"
);
const { calcularDelta } = await import("../lib/delta.ts");

const AHORA = new Date("2026-09-23T12:00:00Z");
const hace = (dias) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();

const stats = (mediano) => ({
  precio_minimo: mediano * 0.5,
  precio_maximo: mediano * 2,
  precio_promedio: mediano,
  precio_promedio_crudo: mediano,
  precio_mediano: mediano,
  p10: mediano * 0.7,
  p25: mediano * 0.8,
  p50: mediano,
  p65: mediano * 1.1,
  p90: mediano * 1.4,
  total_con_precio: 30,
  total_con_ventas: 10,
  total_descartados: 0,
});

const metricas = (vendedores, listings = 30) => ({
  n_listings: listings,
  n_con_precio: listings,
  n_con_vendedor: listings,
  vendedores_unicos: vendedores,
  ratio_vendedores: vendedores / listings,
  reviews_mediana_baratos: null,
  listings_con_ventas: null,
  pct_con_ventas: null,
  mediana_unidades_vendidas: null,
  pct_envio_gratis: null,
  spread_p90_p50: 1.4,
});

const corrida = ({ dias, mediano, vendedores, nombres, score = 50 }) => ({
  fetched_at: hace(dias),
  n_listings: 30,
  precio_stats: stats(mediano),
  metricas: metricas(vendedores),
  vendedores: nombres,
  score,
  formula: "score-v1.2-2026-09-22",
});

const v6 = ["ana", "beto", "caro", "dani", "eze", "flor"];

// Mismo mercado medido dos veces: nada supera el umbral (precio -2%).
const quieto = calcularDelta(
  corrida({ dias: 7, mediano: 10000, vendedores: 6, nombres: v6 }),
  corrida({ dias: 0, mediano: 9800, vendedores: 6, nombres: v6 })
);

// El precio mediano se cae 20%: material por precio.
const precioSeCayo = calcularDelta(
  corrida({ dias: 7, mediano: 10000, vendedores: 6, nombres: v6 }),
  corrida({ dias: 0, mediano: 8000, vendedores: 6, nombres: v6 })
);

// Entran dos vendedores nuevos y el precio no se mueve: material por competencia.
const entraronVendedores = calcularDelta(
  corrida({ dias: 7, mediano: 10000, vendedores: 6, nombres: v6 }),
  corrida({ dias: 0, mediano: 10000, vendedores: 8, nombres: [...v6, "gaby", "hugo"] })
);

const CASOS = [
  // --- Los que NO se mandan. Son el corazon de la feature. -------------------
  {
    nombre: "re-chequeo manual, aunque el nicho se haya movido",
    args: { origen: "manual", delta: precioSeCayo, ultimaNotificacionAt: null, vigiladoDesde: hace(200) },
    espera: false,
  },
  {
    nombre: "primera medicion del nicho (no hay con que comparar)",
    args: { origen: "cron", delta: null, ultimaNotificacionAt: null, vigiladoDesde: hace(1) },
    espera: false,
  },
  {
    nombre: "cambio por debajo del umbral, avisado hace poco",
    args: { origen: "cron", delta: quieto, ultimaNotificacionAt: hace(7), vigiladoDesde: hace(200) },
    espera: false,
  },
  {
    nombre: "nicho quieto, nunca avisado, pero recien agregado",
    args: { origen: "cron", delta: quieto, ultimaNotificacionAt: null, vigiladoDesde: hace(5) },
    espera: false,
  },
  {
    nombre: "nicho quieto, justo un dia antes del resumen",
    args: {
      origen: "cron",
      delta: quieto,
      ultimaNotificacionAt: hace(DIAS_RESUMEN - 1),
      vigiladoDesde: hace(200),
    },
    espera: false,
  },

  // --- Los que si se mandan -------------------------------------------------
  {
    nombre: "el precio mediano se cayo 20%",
    args: { origen: "cron", delta: precioSeCayo, ultimaNotificacionAt: hace(7), vigiladoDesde: hace(200) },
    espera: "cambios",
  },
  {
    nombre: "entraron dos vendedores nuevos",
    args: { origen: "cron", delta: entraronVendedores, ultimaNotificacionAt: hace(7), vigiladoDesde: hace(200) },
    espera: "cambios",
  },
  {
    nombre: "cuatro semanas sin novedades: resumen",
    args: { origen: "cron", delta: quieto, ultimaNotificacionAt: hace(DIAS_RESUMEN), vigiladoDesde: hace(200) },
    espera: "resumen",
  },
  {
    nombre: "nunca se aviso y hace 40 dias que se vigila: resumen",
    args: { origen: "cron", delta: quieto, ultimaNotificacionAt: null, vigiladoDesde: hace(40) },
    espera: "resumen",
  },
];

let fallos = 0;
console.log("\n  Regla de silencio del mail semanal\n");

for (const caso of CASOS) {
  const d = decidirNotificacion({ ...caso.args, ahora: AHORA });
  const obtenido = d.notificar ? d.tipo : false;
  const ok = obtenido === caso.espera;
  if (!ok) fallos++;
  const esperado = caso.espera === false ? "no manda" : `manda (${caso.espera})`;
  const real = obtenido === false ? "no manda" : `manda (${obtenido})`;
  console.log(
    `  ${ok ? "✓" : "✗"} ${caso.nombre}\n      espera: ${esperado} · obtuvo: ${real} — ${d.motivo}`
  );
}

// --- Las filas del mail -----------------------------------------------------
console.log("\n  Filas que entran al mail\n");

const filas = filasDelMail(entraronVendedores);
const etiquetas = filas.map((f) => f.etiqueta);

const pruebas = [
  [
    "ninguna fila sin dato entra al mail",
    !etiquetas.includes("Ofrecen envío gratis") &&
      !etiquetas.includes("Publicaciones con ventas declaradas"),
  ],
  [
    "ninguna fila inmaterial entra al mail",
    filas.length > 0 && filas.length < entraronVendedores.cambios.length,
  ],
  [
    "mas vendedores se pinta MALO aunque el numero suba",
    filas.some((f) => f.etiqueta.startsWith("Vendedores distintos") && f.tono === "malo"),
  ],
  [
    "el mail de un nicho quieto no tendria filas",
    filasDelMail(quieto).length === 0,
  ],
];

for (const [nombre, ok] of pruebas) {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${nombre}`);
}

console.log(
  `\n  ${CASOS.length + pruebas.length - fallos}/${CASOS.length + pruebas.length} — ${
    fallos === 0 ? "OK" : `${fallos} FALLARON`
  }\n`
);
process.exit(fallos === 0 ? 0 : 1);
