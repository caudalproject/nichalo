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
  | "costo_fuera_de_rango"
  | "mezcla_de_productos"
  | "mercado_segmentado";

/**
 * Version corta y legible de cada motivo. `explicarConfianza` de mas abajo da
 * la version larga para el cartel de AvisoConfianza; esto es para cuando el
 * motivo entra en el medio de otra frase — por ejemplo el techo del score
 * (`lib/score.ts`), que hasta el 21/9 imprimia el identificador crudo y le
 * mostraba al usuario "la confianza de los datos es media (sin_datos_de_venta)".
 */
export const ETIQUETA_MOTIVO: Record<MotivoConfianza, string> = {
  dispersion_precios: "los precios están muy dispersos",
  muestra_chica: "hay pocas publicaciones con precio",
  sin_datos_de_venta: "ninguna publicación expone unidades vendidas",
  costo_fuera_de_rango: "el costo ingresado no cierra con los precios del mercado",
  mezcla_de_productos: "la búsqueda trajo más de un producto distinto",
  mercado_segmentado: "el mercado tiene segmentos de precio muy distintos",
};

export interface Confianza {
  nivel: NivelConfianza;
  /** Dispersion sobre el set recortado. Reemplaza al viejo max/min. */
  ratio_p90_p10: number;
  n_con_precio: number;
  n_descartados: number;
  motivos: MotivoConfianza[];
  /** Que estadistico debe mostrar la UI como tendencia central. */
  tendencia_central: "mediana" | "promedio";
  /**
   * Publicaciones descartadas por `lib/relevancia.ts` antes de llegar aca: no
   * eran el producto. Es un numero distinto de `n_descartados`, que son las
   * que se cayeron por precio. Se informan por separado a proposito — "no era
   * el producto" y "estaba fuera de rango" son dos cosas que el usuario lee
   * distinto.
   */
  n_irrelevantes?: number;
  /** Hasta 3 titulos de los irrelevantes, para poder mostrar QUE se tiro. */
  muestra_irrelevante?: string[];
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
export const MUESTRA_MEDIA = 15;
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

/**
 * Proporcion del scrape identificada como no-producto a partir de la cual la
 * dispersion se atribuye a mezcla y no a segmentacion.
 *
 * Bien por debajo del 0,4 con el que el filtro se abstiene: aca no se trata de
 * decidir si filtrar, sino de decidir si lo que quedo DESPUES de filtrar se
 * puede creer. Un scrape del que hubo que sacar un cuarto es un scrape sobre
 * el que conviene no afirmar de mas.
 */
const MEZCLA_PARA_DESCONFIAR = 0.25;

/**
 * Si hay evidencia independiente de que el scrape mezclo productos.
 *
 * "Independiente" quiere decir: que NO salga del ratio de precios. Usar el
 * spread como evidencia de mezcla y despues usar la mezcla para explicar el
 * spread es circular, y es exactamente lo que el sistema venia haciendo.
 *
 * Ante la ausencia de informacion se responde que SI hay evidencia. Que
 * `relevancia` venga null significa que el filtro no corrio (`lib/seguimiento.ts`,
 * tests viejos), y ahi no se sabe nada sobre la limpieza del scrape: el
 * comportamiento conservador es el de antes de este cambio.
 */
function hayEvidenciaDeMezcla(
  relevancia: Parameters<typeof calcularPrecioStats>[3],
  nConPrecio: number
): boolean {
  if (relevancia == null) return true;
  if (!relevancia.aplicado) return true;
  if (nConPrecio < MUESTRA_MEDIA) return true;
  if (relevancia.n_evaluados <= 0) return true;
  const vistos = relevancia.n_descartables ?? relevancia.n_descartados;
  return vistos / relevancia.n_evaluados > MEZCLA_PARA_DESCONFIAR;
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
  costoLocal?: number,
  /**
   * Lo que reporto `lib/relevancia.ts` sobre el scrape ANTES de llegar aca.
   * Opcional: `lib/seguimiento.ts` y los tests lo pueden omitir y el
   * comportamiento queda identico al de antes del 23/9.
   */
  relevancia?: {
    n_descartados: number;
    /**
     * Cuantas vio el filtro como no-producto, se hayan removido o no. Es el
     * numerador correcto para medir mezcla: cuando el filtro se abstiene,
     * `n_descartados` vale 0 por definicion. Opcional por compatibilidad con
     * los tests viejos; si falta se cae a `n_descartados`.
     */
    n_descartables?: number;
    aplicado: boolean;
    muestra_descartada: string[];
    /** Total de publicaciones que miro el filtro, para sacar la proporcion. */
    n_evaluados: number;
  }
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

  // DISPERSION: DOS COSAS DISTINTAS QUE HASTA HOY ERAN UNA (24/9).
  //
  // Un p90/p10 alto puede significar dos cosas opuestas:
  //
  //   (a) el scrape mezclo productos     -> los datos no sirven
  //   (b) el mercado tiene segmentos     -> los datos sirven y ADEMAS dicen algo
  //
  // Hasta hoy las dos caian en `dispersion_precios` -> confianza baja -> techo
  // 60, y el sistema se contradecia solo: el MISMO spread puntuaba 15/15 en
  // `techo_diferenciacion` ("hay un segmento que paga bastante mas que la
  // mediana: se puede diferenciar hacia arriba") mientras capeaba el score por
  // datos poco confiables. El mismo numero, leido con signos opuestos, en la
  // misma pantalla.
  //
  // Caso 212485c5: filtro aplicado, 4 descartes sobre 30 (13%), titulos todos
  // coherentes (aspiradora/inalambrica/mini/portatil/mano/auto), y los caros
  // con nombre — AIWA $119.999, Voltra $144.491. Otra marca del mismo producto
  // es competencia por regla explicita del proyecto. Ahi no hay mezcla: hay un
  // mercado que va del generico a la marca. Score bruto 82, capeado a 60.
  //
  // El desempate no puede salir del ratio, porque el ratio es identico en los
  // dos casos. Sale de si el filtro de relevancia encontro evidencia de mezcla.
  const ratio = p10 > 0 ? p90 / p10 : Infinity;
  const evidenciaDeMezcla = hayEvidenciaDeMezcla(relevancia, validos.length);

  if (ratio > DISPERSION_BAJA) {
    if (evidenciaDeMezcla) {
      motivos.push("dispersion_precios");
      nivel = peor(nivel, "baja");
    } else {
      // El spread es real y es informacion. Degrada a "media" y no mas: la
      // muestra sigue siendo heterogenea y un solo numero la describe peor
      // que a un mercado plano, pero eso no vuelve falsos los datos.
      motivos.push("mercado_segmentado");
      nivel = peor(nivel, "media");
    }
  } else if (ratio > DISPERSION_MEDIA) {
    motivos.push(evidenciaDeMezcla ? "dispersion_precios" : "mercado_segmentado");
    nivel = peor(nivel, "media");
  }

  if (validos.length < MUESTRA_BAJA) {
    motivos.push("muestra_chica");
    nivel = peor(nivel, "baja");
  } else if (validos.length < MUESTRA_MEDIA) {
    motivos.push("muestra_chica");
    nivel = peor(nivel, "media");
  }

  // LA AUSENCIA DE DATOS DE VENTA YA NO DEGRADA LA CONFIANZA (24/9).
  //
  // Degradaba a "media", y "media" capea el score en 75. El problema es
  // cuantas veces pasa: Mercado Libre no publica `soldQuantity` NUNCA. Esta
  // medido y documentado en `lib/apify.ts` — 300 publicaciones, 100% en null —
  // y se ve en los 11 fixtures del golden set: los 11 levantan este motivo,
  // sin excepcion.
  //
  // Un castigo que se aplica al 100% de los casos no es un castigo: es una
  // constante. Lo que producia era que NINGUN analisis pudiera pasar de 75
  // jamas, por una propiedad de la fuente de datos que no tiene nada que ver
  // con el producto que la persona esta validando. Y de paso vaciaba de
  // significado al nivel de confianza, que es la senal con la que el usuario
  // decide si confiar en el numero: si "media" es el piso permanente, no
  // distingue nada.
  //
  // El dato faltante YA se trata en el lugar correcto, y por eso esto era
  // doble conteo: `lib/score.ts` saca "demanda probada" del denominador
  // (punto 2 de su cabecera) en vez de puntuarlo en cero. El bloque se omite,
  // se informa que se omitio, y el score se renormaliza sobre lo que si se
  // pudo medir. Restarle ademas 25 puntos de techo es castigar la misma
  // ausencia dos veces.
  //
  // El motivo SE SIGUE REPORTANDO: viaja en `motivos` y la UI lo muestra. Lo
  // unico que se saco es el `peor(nivel, "media")`. Informar que no hay datos
  // de venta es correcto; capear el veredicto por eso, no.
  if (totalConVentas === 0) {
    motivos.push("sin_datos_de_venta");
  }

  // Costo implausible. Independiente de la dispersion: un scrape puede estar
  // limpio y el costo igual no corresponder al producto. Degrada a baja porque
  // envenena TODO lo derivado (margen, ROI, ganancia, costo_evaluacion) — que
  // es exactamente lo que paso en "Silla gamer".
  if (costoLocal != null && costoLocal > 0 && p10 > 0 && p10 / costoLocal > MARKUP_IMPLAUSIBLE) {
    motivos.push("costo_fuera_de_rango");
    nivel = peor(nivel, "baja");
  }

  // MEZCLA DE PRODUCTOS NO RESUELTA.
  //
  // Solo se levanta cuando el filtro de relevancia vio mucha mezcla y NO pudo
  // limpiarla: descartar habria dejado la muestra por debajo de MUESTRA_MEDIA,
  // asi que devolvio el scrape entero. Es el peor de los casos — la busqueda
  // trajo mayormente otra cosa — y hasta hoy se manifestaba solo de rebote,
  // como dispersion de precios. Dicho asi es accionable: el problema es el
  // termino de busqueda, no el mercado.
  //
  // Si el filtro SI se aplico, esto no se levanta: la mezcla ya se fue y los
  // percentiles de arriba estan calculados sobre publicaciones del producto.
  //
  // OJO CON EL NUMERADOR (fix del 23/9). Tiene que ser `n_descartables` —
  // lo que el filtro VIO — y no `n_descartados` — lo que SACO. Cuando el
  // filtro se abstiene no saca nada, asi que `n_descartados` vale 0, y como
  // la condicion de arriba exige `!aplicado`, este motivo no podia dispararse
  // nunca. La copy ya existia en `explicarConfianza` y no se renderizo jamas.
  if (
    relevancia != null &&
    !relevancia.aplicado &&
    relevancia.n_evaluados > 0 &&
    (relevancia.n_descartables ?? relevancia.n_descartados) / relevancia.n_evaluados > 0.4
  ) {
    motivos.push("mezcla_de_productos");
    nivel = peor(nivel, "baja");
  }

  const confianza: Confianza = {
    nivel,
    ratio_p90_p10: Number.isFinite(ratio) ? Math.round(ratio * 10) / 10 : 999,
    n_con_precio: validos.length,
    n_descartados: descartados,
    motivos,
    tendencia_central: nivel === "alta" ? "promedio" : "mediana",
    n_irrelevantes: relevancia?.aplicado ? relevancia.n_descartados : 0,
    muestra_irrelevante: relevancia?.aplicado ? relevancia.muestra_descartada : [],
  };

  return { stats, confianza };
}

/**
 * Confianza reconstruida para analisis anteriores al 16/9.
 *
 * Esos registros no tienen el campo `confianza` ni los listings crudos (no se
 * guardan en ningun lado), asi que no se puede recalcular bien. Pero dejarlos
 * como "sin medir" los mostraria en verde — y son precisamente los analisis
 * con los numeros sospechosos, incluido el "Silla gamer Yeyian" que origino
 * todo esto.
 *
 * Se reconstruye con lo unico disponible en `resultado_json`: min, max, y el
 * costo contra el precio sugerido. La dispersion vuelve a medirse con max/min
 * porque no hay percentiles guardados, pero con un umbral bastante mas alto
 * (20x en vez de 10x) justamente porque sabemos que ese ratio sobre-dispara.
 *
 * Es deliberadamente conservadora: ante la duda degrada. Un analisis viejo
 * mostrado con mas cautela de la necesaria cuesta mucho menos que uno sucio
 * mostrado en verde.
 */
export function confianzaHeredada(args: {
  precioMinimo?: number;
  precioMaximo?: number;
  precioSugerido?: number;
  costoLocal?: number;
}): Confianza | null {
  const { precioMinimo = 0, precioMaximo = 0, precioSugerido = 0, costoLocal = 0 } = args;
  if (precioMinimo <= 0 || precioMaximo <= 0) return null;

  const motivos: MotivoConfianza[] = [];
  let nivel: NivelConfianza = "alta";

  const ratioCrudo = precioMaximo / precioMinimo;
  if (ratioCrudo > 20) {
    motivos.push("dispersion_precios");
    nivel = peor(nivel, "baja");
  } else if (ratioCrudo > 10) {
    motivos.push("dispersion_precios");
    nivel = peor(nivel, "media");
  }

  if (costoLocal > 0 && precioSugerido > 0 && precioSugerido / costoLocal > MARKUP_IMPLAUSIBLE) {
    motivos.push("costo_fuera_de_rango");
    nivel = peor(nivel, "baja");
  }

  if (motivos.length === 0) return null;

  return {
    nivel,
    ratio_p90_p10: Math.round(ratioCrudo * 10) / 10,
    n_con_precio: 0,
    n_descartados: 0,
    motivos,
    tendencia_central: "mediana",
  };
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
  if (confianza.motivos.includes("mercado_segmentado")) {
    partes.push(
      `los precios van de ${formatear(stats.precio_minimo)} a ${formatear(
        stats.precio_maximo
      )}, y no es ruido: son segmentos distintos del mismo mercado (genéricos abajo, marcas reconocidas arriba). Un solo precio promedio no describe bien a ninguno de los dos, así que los números de abajo están calculados sobre la mediana`
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
  if (confianza.motivos.includes("mezcla_de_productos")) {
    partes.push(
      `buena parte de las publicaciones que trajo la búsqueda no son este producto, sino accesorios, repuestos o artículos parecidos — y son tantas que descartarlas dejaría una muestra demasiado chica para un veredicto`
    );
  }
  if (confianza.motivos.includes("costo_fuera_de_rango")) {
    partes.push(
      `el costo que ingresaste es muy bajo frente a lo que se vende este producto en el mercado — revisá que sea el costo de este producto y que esté en la moneda correcta, porque de ese número dependen el margen y el ROI`
    );
  }

  return partes.join("; ");
}
