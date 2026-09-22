/**
 * El informe de muestra que la landing usa para enseñar el formato del output.
 *
 * QUE ES Y QUE NO ES (decision 21/9)
 * ----------------------------------
 * Estos numeros estan CONSTRUIDOS a mano. No salen de ningun analisis que haya
 * corrido, y la landing no dice que hayan salido: el bloque se titula "Asi se
 * ve un informe de Nichalo" y se presenta como ejemplo.
 *
 * El 13/9 se hizo el camino inverso — se reemplazo un mock por un analisis
 * real — porque el mock de entonces se mostraba *afirmando que era real*. Ese
 * era el problema, no el mock. Un ejemplo etiquetado como ejemplo es material
 * de producto normal; el mismo ejemplo vendido como "analisis real y
 * verificable" es otra cosa.
 *
 * NO HAY analisis publico destacado (decision 21/9). El unico candidato era de
 * junio, anterior al campo `confianza`, y la reconstruccion conservadora lo
 * marcaba baja por markup 7,66x: la landing terminaba linkeando a un informe
 * con cartel de "datos poco confiables". Se saco el link de la landing y de la
 * seccion de planes. Si alguna vez vuelve a haber un analisis real que valga la
 * pena mostrar, `scripts/proponer-ejemplo.mjs` genera este bloque desde la base
 * y hay que volver a poner el link y el check de prebuild (ver historial de
 * git: scripts/check-featured-result.mjs).
 *
 * REGLA AL EDITAR: los numeros tienen que cerrar entre si. Un visitante que
 * vende en ML suma. Antes de tocar nada, verificar:
 *   ganancia   = precioSugerido - costo - comisionMl
 *   margen%    = ganancia / precioSugerido
 *   comisionMl ≈ 15% de precioSugerido (comision clasica ML)
 *   suma(distribucion.cantidad) = publicacionesAnalizadas
 *   precioSugerido y precioPromedio caen en el bucket mas poblado
 *   precioSugerido / costo < 6  (el umbral de markup implausible de
 *                                lib/confianza.ts — el ejemplo no puede
 *                                violar la regla que el propio producto aplica)
 */

export const EJEMPLO_LANDING = {
  producto: "Botella térmica 750ml acero inoxidable",
  pais: "Argentina",
  score: 82,
  veredicto: "VIABLE",
  publicacionesAnalizadas: 60,

  precioPromedio: "$ 31.450",
  precioMinimo: "$ 14.200",
  precioMaximo: "$ 58.900",

  // 32.900 − 9.800 − 4.935 = 18.165 · 18.165 / 32.900 = 55,2%
  // comision 4.935 = 15% de 32.900 · markup 32.900 / 9.800 = 3,36x (< 6x)
  costo: "$ 9.800",
  precioSugerido: "$ 32.900",
  comisionMl: "$ 4.935",
  ganancia: "$ 18.165",
  margenPorcentaje: "55,2%",

  resumen:
    "El mercado de 'Botella térmica 750ml acero inoxidable' en Argentina está consolidado pero no saturado: las 60 publicaciones se agrupan entre $20.000 y $40.000, y el costo de importación deja margen para entrar por debajo del promedio sin resignar rentabilidad.",

  riesgos: [
    "El rango de precios es amplio ($14.200 a $58.900): parte de las publicaciones son botellas de menor capacidad, así que el promedio sobreestima lo que vale un 750ml.",
    "Es una categoría con vendedores consolidados y reputación verde — entrar sin ventas previas obliga a apoyarse en precio o en envío gratis los primeros meses.",
  ],

  // 11 + 34 + 15 = 60 = publicacionesAnalizadas
  distribucion: [
    { rango: "Menos de $20.000", cantidad: 11 },
    { rango: "$20.000 – $40.000", cantidad: 34 },
    { rango: "Más de $40.000", cantidad: 15 },
  ],
} as const;
