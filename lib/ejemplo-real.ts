/**
 * El analisis real y publico que la landing muestra como ejemplo.
 *
 * Auditoria 13/9, problema 1: el "cargador inalambrico 15W, score 78" era
 * inventado y aparecia en cuatro secciones distintas. Se reemplazo por un
 * analisis que corrio de verdad, que cualquiera puede abrir sin cuenta.
 *
 * REGLA: estos valores tienen que coincidir con los del registro
 * `FEATURED_RESULT_ID` en Supabase. `scripts/check-featured-result.mjs`
 * corre en prebuild y falla el build si alguno dejo de coincidir (o si el
 * resultado ya no resuelve para un anonimo), asi que no puede desincronizarse
 * en silencio como paso con el link roto del 13/9.
 *
 * Los montos en USD del `resultado_json` se muestran convertidos a ARS con
 * la `tasa_cambio` que quedo guardada en ese mismo analisis (1442.4148), que
 * es la que uso el modelo al calcular. No se recalculan con la cotizacion de
 * hoy a proposito: el ejemplo tiene que seguir cerrando consigo mismo.
 */

export const FEATURED_RESULT_ID =
  process.env.NEXT_PUBLIC_FEATURED_RESULT_ID ||
  "3ac26d02-3530-4178-8680-a5245635c62b";

export const EJEMPLO_REAL = {
  producto: "Camiseta deportiva talle único",
  pais: "Argentina",
  score: 80,
  veredicto: "VIABLE",
  publicacionesAnalizadas: 60,

  // competencia.* del resultado_json, en ARS tal cual los devolvio el scrape
  precioPromedio: "$ 29.891",
  precioMinimo: "$ 11.399",
  precioMaximo: "$ 55.031",

  // margen.* — en USD en la base, convertidos a ARS con tasa_cambio 1442.4148
  costo: "$ 3.995",
  precioSugerido: "$ 30.602",
  comisionMl: "$ 4.587",
  ganancia: "$ 22.011",
  margenPorcentaje: "71,9%",

  // Primera frase del `resumen`, textual.
  resumen:
    "El mercado de 'Camiseta deportiva talle único' en Argentina presenta una oportunidad viable para un vendedor experto, a pesar de la alta cantidad de publicaciones generales (60).",

  // Dos de los cuatro `riesgos`, textuales.
  riesgos: [
    "La ausencia de datos de ventas en el scraping impide validar la demanda real del producto en el mercado.",
    "El mercado de indumentaria básica es sensible al precio, lo que exige una estrategia de precios dinámica.",
  ],

  distribucion: [
    { rango: "Menos de $20.000", cantidad: 3 },
    { rango: "$20.000 – $40.000", cantidad: 4 },
    { rango: "Más de $40.000", cantidad: 2 },
  ],
} as const;
