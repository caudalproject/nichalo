/**
 * Que haria el cron del seguimiento AHORA, con las variables de entorno que
 * tenga cargadas la sesion. No es un simulacro: corre `elegirYEncolar()` de
 * verdad — asi que con SEGUIMIENTO_CRON=on encola scrapes pagos de verdad.
 *
 * El uso seguro es con el default (`off`) o con `prueba` y una lista de mails
 * que no matchee a nadie: en los dos casos recorre las mismas consultas, dice
 * cuantos nichos habria tomado y por que saltea cada uno, sin gastar un peso.
 *
 *   npx tsx --env-file=.env.local scripts/dry-run-cron.mjs
 *   SEGUIMIENTO_CRON=prueba SEGUIMIENTO_CRON_EMAILS=nadie@ejemplo.test \
 *     npx tsx --env-file=.env.local scripts/dry-run-cron.mjs
 *
 * Los motivos de salteo son el mapa de frenos: `sin_cupo_en_el_mes` es el tope
 * del TAB 6, `medido_hace_menos_de_6_dias` es el respeto al boton manual,
 * `techo_de_corrida` es SEGUIMIENTO_CRON_MAX.
 */

const { elegirYEncolar, modoCron } = await import("../lib/cron-seguimiento.ts");

console.log(`\n  SEGUIMIENTO_CRON = ${modoCron()}\n`);
const r = await elegirYEncolar();
console.log(JSON.stringify(r, null, 2));
if (r.encolados > 0) {
  console.log(`\n  OJO: se encolaron ${r.encolados} re-chequeos REALES (~$${r.encolados * 119} ARS de Apify).\n`);
}
