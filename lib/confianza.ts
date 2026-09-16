/**
 * Confianza estadistica del scrape — concepto de primera clase del output.
 *
 * Motivo (auditoria 13/9, TAB 3): el analisis "Silla gamer Yeyian Sigurd"
 * mostraba margen 92,8% y ROI 1283,3% en verde con badge "Competitivo", y al
 * mismo tiempo el warning amarillo de que los precios iban de $24.436 a
 * $2.695.000. El sistema detectaba el ruido y publicaba los derivados como si
 * fueran confiables.
 *
 * La causa de fondo era que la dispersion existia solo como un `&&` dentro del
 * JSX de `app/resultado/[id]/page.tsx`: no era un campo, Gemini no la veia y la
 * logica del Badge no la consultaba. Dos sistemas que no se hablaban.
 *
 * Aca la dispersion pasa a ser un objeto que se calcula una vez en el servidor,
 * viaja dentro de `resultado_json` y lo consumen el prompt y la UI.
 *
 * DOS DECISIONES DE METODO, a proposito:
 *
 * 1. NO se usa max/min como medida de dispersion. Es el ratio mas sensible a
 *    outliers que existe: una sola publicacion mal tipeada, un lote mayorista o
 *    un repuesto lo dispara. Con la regla vieja (max/min > 10) daban "dispersos"
 *    21 de 34 analisis historicos — el 62%. Se usa p90/p10 sobre el set ya
 *    recortado, que es lo que de verdad indica mezcla de categorias.
 *
 * 2. Se recorta antes de calcular, y se REPORTA cuanto se recorto. Un usuario
 *    que lee "descartamos 7 publicaciones fuera de rango" confia mas, no menos.
 *    El recorte solo se aplica con muestra suficiente (>= 20): por debajo de eso
 *    tirar el 10% destruye mas informacion de la que limpia.
 *
 * Los umbrales de abajo son tentativos y estan para calibrarse. Antes de esto
 * no se persistian percentiles, asi que la pregunta "cuan disperso es el scrape
 * tipico" no se puede responder retroactivamente — los listings crudos no se
 * guardan en ningun lado (ni en `analyses` ni en `analysis_cache`). Empiezan a
 * medirse desde este commit.
 */

export type NivelConfianza = "alta" | "media" | "baja";

export type MotivoConfianza =
  | "dispersion_precios"
  | "muestra_chica"
  | "sin_datos_de_venta"
  | "costo_fuera_de_rango";

export interface Confianza {
  nivel: NivelConfianza;
  /** Dispersion sobre el set recortado. Reemplaza al viejo max/min. */
  ratio_p90_p10: number;
  n_con_precio: number;
  n_descartados: number;
  motivos: MotivoConfianza[];
  /** Que estadistico debe mostrar la UI como tendencia central. */
  tendencia_central: "mediana" | "promedio";
}

export interface PrecioStats {
  precio_minimo: number;
  precio_maximo: number;
  /** Promedio del set recortado. Es el que se muestra y el que ve Gemini. */
  precio_promedio: number;
  /** Promedio sin recortar. Se guarda para poder auditar el efecto del recorte. */
  precio_promedio_crudo: number;
  precio_mediano: number;
  p10: number;
  p25: number;
  p50: number;
  p65: number;
  p90: number;
  total_con_precio: number;
  total_con_ventas: number;
  total_descartados: number;
}

/** Umbrales de dispersion sobre p90/p10 (set recortado). */
const DISPERSION_MEDIA = 4;
const DISPERSION_BAJA = 8;

/** Debajo de esto la muestra no alcanza para un veredicto firme. */
const MUESTRA_MEDIA = 15;
const MUESTRA_BAJA = 8;

/** Debajo de esto no se recorta: tirar el 10% costaria mas de lo que limpia. */
const MINIMO_PARA_RECORTAR = 20;

/**
 * Si el mercado (p10) vale mas que esto veces el costo ingresado, el costo casi
 * seguro no corresponde al producto buscado.
 *
 * Es la senal que de verdad explica el ROI de 1283% de "Silla gamer Yeyian":
 * costo $12.000 contra un p10 de $165.990 — 13,8x. Ninguna silla gamer se
 * compra a $12.000 y se vende a $165.990; lo que pasa es que el usuario puso el
 * costo de otra cosa, o en otra moneda, o se equivoco de ceros.
 *
 * La dispersion de precios NO capturaba este caso: un scrape puede estar
 * perfectamente limpio y el costo seguir siendo irreal. Son dos fallas
 * independientes y por eso son dos motivos distintos.
 *
 * 6x es deliberadamente permisivo: el dropshipping desde China con 4-5x de
 * markup es real y no tiene que disparar la alerta. Arriba de 6x, no.
 */
const MARKUP_IMPLAUSIBLE = 6;

/** Percentil por nearest-rank sobre un array YA ordenado ascendente. */
function percentil(ordenados: number[], q: number): number {
  if (ordenados.length === 0) return 0;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.floor(ordenados.length * q)));
  return ordenados[i];
}

function promedio(xs: number[]): number {
  if (xs.length === 0) return 0;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/** El peor de dos niveles gana — la confianza nunca sube por acumular senales. */
function peor(a: NivelConfianza, b: NivelConfianza): NivelConfianza {
  const orden: NivelConfianza[] = ["alta", "media", "baja"];
  return orden.indexOf(a) >= orden.indexOf(b) ? a : b;
}

/**
 * Calcula percentiles y confianza a partir de los precios crudos del scrape.
 *
 * @param precios       precios en moneda local, sin filtrar ni ordenar
 * @param totalConVentas cuantos listings traian soldQuantity > 0
 */
export function calcularPrecioStats(
  precios: number[],
  totalConVentas: number,
  /** Costo ingresado por el usuario, en la MISMA moneda que los precios. */
  costoLocal?: number
): { stats: PrecioStats; confianza: Confianza } | null {
  const validos = precios
    .filter((p) => typeof p === "number" && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (validos.length === 0) return null;

  // Recorte [p05, p95] — solo con muestra suficiente Y solo si hay algo que
  // recortar. Aplicarlo de rutina sobre un mercado limpio hacia que la UI
  // dijera "descartamos 5 publicaciones" sin que ninguna fuera un outlier.
  let usados = validos;
  let descartados = 0;
  const ratioCrudo =
    percentil(validos, 0.1) > 0 ? percentil(validos, 0.9) / percentil(validos, 0.1) : Infinity;

  if (validos.length >= MINIMO_PARA_RECORTAR && ratioCrudo > DISPERSION_MEDIA) {
    const lo = percentil(validos, 0.05);
    const hi = percentil(validos, 0.95);
    const recortado = validos.filter((p) => p >= lo && p <= hi);
    // Guarda: si el recorte se lleva mas de la mitad, los datos son tan raros
    // que el recorte miente mas que los outliers. Se deja crudo y se degrada.
    if (recortado.length >= Math.ceil(validos.length * 0.5)) {
      descartados = validos.length - recortado.length;
      usados = recortado;
    }
  }

  const p10 = percentil(usados, 0.1);
  const p90 = percentil(usados, 0.9);
  const mediana = percentil(usados, 0.5);

  const stats: PrecioStats = {
    // min/max siguen siendo los REALES del scrape, no los recortados: el
    // usuario tiene que poder ver el rango completo de lo que se encontro.
    precio_minimo: validos[0],
    precio_maximo: validos[validos.length - 1],
    precio_promedio: promedio(usados),
    precio_promedio_crudo: promedio(validos),
    precio_mediano: mediana,
    p10,
    p25: percentil(usados, 0.25),
    p50: mediana,
    p65: percentil(usados, 0.65),
    p90,
    total_con_precio: validos.length,
    total_con_ventas: totalConVentas,
    total_descartados: descartados,
  };

  const motivos: MotivoConfianza[] = [];
  let nivel: NivelConfianza = "alta";

  const ratio = p10 > 0 ? p90 / p10 : Infinity;
  if (ratio > DISPERSION_BAJA) {
    motivos.push("dispersion_precios");
    nivel = peor(nivel, "baja");
  } else if (ratio > DISPERSION_MEDIA) {
    motivos.push("dispersion_precios");
    nivel = peor(nivel, "media");
  }

  if (validos.length < MUESTRA_BAJA) {
    motivos.push("muestra_chica");
    nivel = peor(nivel, "baja");
  } else if (validos.length < MUESTRA_MEDIA) {
    motivos.push("muestra_chica");
    nivel = peor(nivel, "media");
  }

  // La ausencia de datos de venta no vuelve el precio poco confiable, pero si
  // debilita el veredicto de demanda. Degrada a media como maximo, nunca a baja
  // por si sola (misma logica que la nota del prompt sobre soldQuantity null).
  if (totalConVentas === 0) {
    motivos.push("sin_datos_de_venta");
    nivel = peor(nivel, "media");
  }

  // Costo implausible. Independiente de la dispersion: un scrape puede estar
  // limpio y el costo igual no corresponder al producto. Degrada a baja porque
  // envenena TODO lo derivado (margen, ROI, ganancia, costo_evaluacion) — que
  // es exactamente lo que paso en "Silla gamer".
  if (costoLocal != null && costoLocal > 0 && p10 > 0 && p10 / costoLocal > MARKUP_IMPLAUSIBLE) {
    motivos.push("costo_fuera_de_rango");
    nivel = peor(nivel, "baja");
  }

  const confianza: Confianza = {
    nivel,
    ratio_p90_p10: Number.isFinite(ratio) ? Math.round(ratio * 10) / 10 : 999,
    n_con_precio: validos.length,
    n_descartados: descartados,
    motivos,
    tendencia_central: nivel === "alta" ? "promedio" : "mediana",
  };

  return { stats, confianza };
}

/** Texto para el usuario. Concreto y accionable, no un disclaimer generico. */
export function explicarConfianza(
  confianza: Confianza,
  stats: Pick<PrecioStats, "precio_minimo" | "precio_maximo">,
  formatear: (n: number) => string
): string | null {
  if (confianza.nivel === "alta") return null;

  const partes: string[] = [];

  if (confianza.motivos.includes("dispersion_precios")) {
    partes.push(
      `los precios encontrados van de ${formatear(stats.precio_minimo)} a ${formatear(
        stats.precio_maximo
      )} — es muy probable que la búsqueda haya mezclado categorías (accesorios, repuestos o lotes junto al producto)`
    );
  }
  if (confianza.motivos.includes("muestra_chica")) {
    partes.push(
      `solo se encontraron ${confianza.n_con_precio} publicaciones con precio, pocas para un veredicto firme`
    );
  }
  if (confianza.motivos.includes("sin_datos_de_venta")) {
    partes.push(
      `ninguna publicación expone unidades vendidas, así que la demanda es una estimación y no un dato`
    );
  }
  if (confianza.motivos.includes("costo_fuera_de_rango")) {
    partes.push(
      `el costo que ingresaste es muy bajo frente a lo que se vende este producto en el mercado — revisá que sea el costo de este producto y que esté en la moneda correcta, porque de ese número dependen el margen y el ROI`
    );
  }

  return partes.join("; ");
}
