/**
 * Manda los DOS mails del TAB 5.1 a una casilla, sobre un delta inventado.
 *
 * Para que existe: el mail de cambios solo sale cuando hay dos mediciones de un
 * nicho y la segunda se movio. Esperar a que eso pase de verdad para recien ahi
 * descubrir que el HTML se rompe en Gmail es caro — cada medicion es un scrape
 * pago. Esto prueba la plantilla y que Resend acepte el envio, sin tocar la
 * base ni pagar nada.
 *
 * Lo que NO prueba: que el cron elija bien los nichos (eso es
 * scripts/tmp/dry-run) ni la regla de silencio (scripts/validar-notificacion).
 *
 * Uso: npx tsx --env-file=.env.local scripts/probar-mail-seguimiento.mjs tu@mail.com
 */

const destino = process.argv[2];
if (!destino) {
  console.error("Falta el mail destino.\n  npx tsx --env-file=.env.local scripts/probar-mail-seguimiento.mjs tu@mail.com");
  process.exit(1);
}

const { sendSeguimientoEmail } = await import("../lib/resend.ts");
const { filasDelMail } = await import("../lib/regla-notificacion.ts");
const { calcularDelta } = await import("../lib/delta.ts");

const stats = (m) => ({
  precio_minimo: m * 0.5, precio_maximo: m * 2, precio_promedio: m,
  precio_promedio_crudo: m, precio_mediano: m,
  p10: m * 0.7, p25: m * 0.8, p50: m, p65: m * 1.1, p90: m * 1.4,
  total_con_precio: 30, total_con_ventas: 11, total_descartados: 0,
});
const metricas = (v) => ({
  n_listings: 30, n_con_precio: 30, n_con_vendedor: 30,
  vendedores_unicos: v, ratio_vendedores: v / 30,
  reviews_mediana_baratos: null, listings_con_ventas: null, pct_con_ventas: null,
  mediana_unidades_vendidas: null, pct_envio_gratis: null, spread_p90_p50: 1.4,
});
const corrida = (diasAtras, mediano, vendedores, nombres) => ({
  fetched_at: new Date(Date.now() - diasAtras * 86_400_000).toISOString(),
  n_listings: 30, precio_stats: stats(mediano), metricas: metricas(vendedores),
  vendedores: nombres, score: 61, formula: "score-v1.2-2026-09-22",
});

const antes = ["tienda norte", "hogar ya", "casa lopez", "electro sur", "market bue", "nube shop"];
const delta = calcularDelta(
  corrida(7, 24900, 6, antes),
  corrida(0, 19900, 9, [...antes, "premium home", "deco express", "shop centro"])
);

console.log("titular:", delta.titular);
console.log("filas:", filasDelMail(delta).map((f) => `${f.etiqueta}: ${f.antes} → ${f.ahora} (${f.tono})`));

const ok1 = await sendSeguimientoEmail({
  email: destino,
  producto: "almohadilla eléctrica cervical",
  titular: delta.titular,
  tipo: "cambios",
  dias: delta.dias,
  filas: filasDelMail(delta),
  vendedoresNuevos: delta.vendedores?.nuevos ?? [],
  nichoUrl: (process.env.SITE_URL ?? "https://nichalo.com") + "/vigilancia",
});
console.log(ok1 ? "✓ mail de CAMBIOS enviado" : "✗ fallo el mail de cambios");

const ok2 = await sendSeguimientoEmail({
  email: destino,
  producto: "almohadilla eléctrica cervical",
  titular: "Tu nicho sigue tranquilo",
  tipo: "resumen",
  dias: 28,
  mediciones: 4,
  filas: [],
  vendedoresNuevos: [],
  nichoUrl: (process.env.SITE_URL ?? "https://nichalo.com") + "/vigilancia",
});
console.log(ok2 ? "✓ mail de RESUMEN enviado" : "✗ fallo el mail de resumen");

process.exit(ok1 && ok2 ? 0 : 1);
