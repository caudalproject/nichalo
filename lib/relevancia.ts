/**
 * Filtro de relevancia del scrape (23/9/2026).
 *
 * POR QUE EXISTE
 *
 * Hasta hoy el pipeline no preguntaba en ningun momento si una publicacion
 * **era el producto**. Filtraba por precio — el recorte [p05,p95] de
 * `lib/confianza.ts` — que descarta el 5% mas caro sea lo que sea, sin mirar
 * que es. Cuando Mercado Libre devuelve fundas, repuestos y lotes junto al
 * producto, ese recorte no limpia: mueve las colas y deja la mezcla adentro.
 *
 * Caso real del 21/9, "almohadilla electrica cervical": precios de $10.787 a
 * $499.999 sobre 30 publicaciones. El recorte descarto 2 y el ratio p90/p10
 * siguio arriba de 8. El sistema hizo lo correcto con lo que tenia — degrado a
 * confianza baja, capeo el score en 60, ofrecio el reintento — pero el usuario
 * igual se llevo un analisis que no servia, y el reintento con el mismo termino
 * le iba a dar lo mismo.
 *
 * La foto obligatoria (21/9, `3125fe8`) ataco el lado de la CONSULTA: buscar
 * mejor. Esto ataca el lado de la RESPUESTA: descartar lo que llego y no
 * corresponde. Son complementarias — una mejor query sigue trayendo accesorios,
 * porque ML rankea por relevancia comercial y no por identidad de producto.
 *
 * LA REGLA QUE LO MANTIENE HONESTO
 *
 * Solo descarta con **evidencia en el titulo**: o le faltan las palabras de la
 * consulta, o dice explicitamente que es otra cosa ("funda para", "repuesto
 * de"). No infiere por precio: eso ya lo hace el recorte, y hacerlo dos veces
 * con dos criterios distintos esconde cual de los dos actuo.
 *
 * LA PROPIEDAD QUE LO HACE SEGURO
 *
 * Se desactiva solo. Si el filtro dejaria la muestra por debajo de
 * `MUESTRA_MEDIA` (el umbral con el que `confianza.ts` empieza a desconfiar),
 * no se aplica nada y se devuelve el scrape entero. Un filtro que se lleva
 * media muestra miente mas que los outliers que saca — mismo criterio que la
 * guarda del 50% del recorte [p05,p95], y por eso el umbral se importa de alla
 * en vez de copiarse.
 *
 * QUE **NO** HACE
 *
 * No toca packs ni combos. "Pack x3" es el producto vendido de a tres, no otra
 * cosa: normalizarlo es trabajo de `lib/unidad.ts` (TAB 3.2), que corre
 * inmediatamente despues. Meter "pack" en la lista de ruido de abajo
 * desarmaria ese trabajo y volveria a traer el bug del 21/9.
 */

import type { MLListing } from "./apify";
import { MUESTRA_MEDIA } from "./confianza";

export interface ResultadoRelevancia {
  /** Los listings que sobrevivieron. Si `aplicado` es false, son todos. */
  listings: MLListing[];
  n_descartados: number;
  /**
   * Cuantas publicaciones el filtro IDENTIFICO como no-producto, se hayan
   * removido o no.
   *
   * Existe separado de `n_descartados` por el bug del 23/9: cuando el filtro se
   * abstiene devuelve `n_descartados: 0` (correcto — no saco nada), y
   * `confianza.ts` medía la mezcla con ese cero. El motivo
   * `mezcla_de_productos` era por eso inalcanzable: la única condición que lo
   * levanta es `!aplicado`, y en `!aplicado` el numerador siempre valia 0.
   *
   * `n_descartados` = lo que se saco. `n_descartables` = lo que se vio.
   * La mezcla se mide con el segundo; lo que se le informa al usuario que se
   * removio, con el primero.
   */
  n_descartables: number;
  /** false = el filtro se auto-desactivo por las guardas de abajo. */
  aplicado: boolean;
  /** Hasta 3 titulos descartados. Van a la UI: el usuario tiene que poder ver
   *  QUE se tiro, o "descartamos 7" es un acto de fe. */
  muestra_descartada: string[];
}

/**
 * Palabras que no distinguen nada. Sin esta lista, "almohadilla **electrica**
 * **para** cuello" le daria credito a cualquier titulo que diga "para".
 */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "para", "por", "con", "sin", "y", "o", "en", "al", "a", "the", "of",
  "tipo", "modelo", "nuevo", "nueva", "original", "premium", "calidad",
]);

/**
 * Terminos que declaran que la publicacion es **otra cosa**: un accesorio, una
 * parte, o el producto en un estado que no es el que se esta validando.
 *
 * Deliberadamente corta y conservadora. Cada palabra que se agregue aca puede
 * tirar una publicacion legitima, y el costo de un falso positivo (achicar la
 * muestra) es mayor que el de un falso negativo (que ya lo agarra el recorte
 * por precio, que sigue corriendo despues).
 *
 * Un termino de esta lista NO cuenta como ruido si el usuario lo puso en su
 * busqueda: quien valida "funda para iPhone" quiere exactamente las fundas.
 */
const RUIDO = [
  "funda", "fundas", "repuesto", "repuestos", "recambio", "accesorio",
  "accesorios", "soporte", "adaptador", "cargador", "cable", "estuche",
  "parte", "bolso", "bolsa", "cubre", "protector", "filtro", "filtros",
  "control remoto", "manual", "instructivo", "usado", "usada", "fallado",
  "no funciona", "para reparar", "solo el", "solo la", "sticker", "calcomania",
  "miniatura", "juguete", "repuesto original",
];

/** Debajo de esta cobertura de tokens, el titulo habla de otra cosa. */
const COBERTURA_MINIMA = 0.5;

/**
 * Proporcion maxima del scrape que el filtro puede descartar.
 *
 * Arriba de esto la explicacion mas probable ya no es "el mercado tiene basura"
 * sino "mi criterio esta mal" — y equivocarse en esa direccion es el error caro,
 * porque tirar producto legitimo no se ve por ningun lado, mientras que la
 * mezcla que se deja pasar al menos sale reportada como dispersion.
 *
 * Cuando se cruza este techo el filtro se abstiene y `confianza.ts` levanta el
 * motivo `mezcla_de_productos`: el analisis sale igual, pero diciendo que la
 * busqueda trajo mayormente otra cosa. Se informa en vez de adivinar.
 */
const MAXIMO_DESCARTABLE = 0.4;

/** Normaliza para comparar: sin tildes, sin puntuacion, en minuscula. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plural pobre pero suficiente: "almohadillas" -> "almohadilla". No es un
 * stemmer y no pretende serlo; solo evita que el plural del vendedor cuente
 * como palabra ausente.
 */
function raiz(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length >= 3 && !VACIAS.has(t))
    .map(raiz);
}

/**
 * El titulo contiene el token, su plural o su otro genero.
 *
 * El genero importa mas de lo que parece: medido el 23/9, "camiseta deportiva
 * dry fit" descartaba "Remera Camiseta Jersey Estilo **Deportivo**" porque
 * `deportivo` no empieza con `deportiva`. Se perdian 15 de 30 publicaciones de
 * un scrape que estaba limpio, y la mediana caia 34%.
 *
 * La regla del prefijo comun solo se activa con palabras de 5+ letras: con
 * menos, "gas"/"gis" o "par"/"pan" pasarian por la misma puerta.
 */
function contiene(tituloRaices: string[], token: string): boolean {
  return tituloRaices.some((t) => {
    if (t === token || t.startsWith(token) || token.startsWith(t)) return true;
    const minimo = Math.min(t.length, token.length);
    if (minimo < 5) return false;
    return t.slice(0, minimo - 1) === token.slice(0, minimo - 1);
  });
}

/**
 * Descarta del scrape las publicaciones que no son el producto buscado.
 *
 * @param producto      lo que tipeo el usuario.
 * @param searchKeyword la keyword derivada de la foto, si hubo. Suma tokens a
 *                      la cobertura. Ninguno de los dos aporta un token
 *                      obligatorio — ver el comentario de adentro.
 */
export function filtrarRelevantes(args: {
  producto: string;
  searchKeyword?: string | null;
  listings: MLListing[];
}): ResultadoRelevancia {
  const { producto, searchKeyword, listings } = args;

  const sinFiltrar: ResultadoRelevancia = {
    listings,
    n_descartados: 0,
    n_descartables: 0,
    aplicado: false,
    muestra_descartada: [],
  };

  const tokensProducto = tokenizar(producto ?? "");
  if (tokensProducto.length === 0) return sinFiltrar;

  // NO HAY TOKEN OBLIGATORIO. Medido el 23/9 contra los 10 fixtures del golden
  // set: la primera version exigia que el titulo contuviera el primer token del
  // producto, y eso producia falsos positivos caros porque los vendedores de ML
  // usan sinonimos para el sustantivo principal.
  //
  //   "termo stanley 473ml"      tiraba "Botella Termica Stanley ... 473 Ml"
  //   "mini lavadora portatil"   tiraba "Lavadora Portatil Recargable"
  //   "organizador de cables"    tiraba "Bandeja Porta Cables Para Escritorio"
  //
  // Las tres SON el producto. Con el ancla obligatoria el filtro se llevaba 15
  // de 30 publicaciones del fixture de Stanley — la mitad del mercado, y las
  // legitimas. Un filtro que tira producto real es peor que no filtrar: la
  // mezcla al menos se ve en la dispersion, esto no se ve en ningun lado.
  //
  // Queda solo la cobertura, que tolera un sinonimo (pierde un token de tres y
  // sigue pasando) pero no tolera que el titulo hable de otra cosa.

  const tokensKeyword = searchKeyword ? tokenizar(searchKeyword) : [];
  const tokens = Array.from(new Set([...tokensProducto, ...tokensKeyword]));

  // El ruido solo es ruido si el usuario no lo esta buscando.
  const consultaNormalizada = normalizar(`${producto} ${searchKeyword ?? ""}`);
  const ruidoActivo = RUIDO.filter((r) => !consultaNormalizada.includes(r));

  const descartados: MLListing[] = [];
  const sobreviven: MLListing[] = [];

  for (const listing of listings) {
    const titulo = listing.title ?? "";
    if (!titulo) {
      // Sin titulo no hay evidencia para descartar. Se queda: la regla es
      // descartar con evidencia, no ante la duda.
      sobreviven.push(listing);
      continue;
    }

    const tituloNorm = normalizar(titulo);
    const tituloRaices = tokenizar(titulo);

    const presentes = tokens.filter((t) => contiene(tituloRaices, t)).length;
    const cobertura = tokens.length > 0 ? presentes / tokens.length : 1;
    const tieneRuido = ruidoActivo.some((r) => tituloNorm.includes(r));

    // Cobertura total gana sobre el ruido: "almohadilla electrica cervical con
    // funda lavable" ES el producto, y la funda es una caracteristica.
    const esRelevante = cobertura >= COBERTURA_MINIMA && (!tieneRuido || cobertura === 1);

    if (esRelevante) sobreviven.push(listing);
    else descartados.push(listing);
  }

  if (descartados.length === 0) return sinFiltrar;

  // GUARDA. El filtro no puede dejar la muestra por debajo del umbral con el
  // que `confianza.ts` ya empieza a desconfiar: si para limpiar hay que bajar
  // de ahi, el problema no son cuatro accesorios sueltos sino que la busqueda
  // entera trajo otra cosa — y eso se informa degradando la confianza, que es
  // lo que pasa solo si no tocamos nada.
  //
  // Se abstiene, pero REPORTA lo que vio: `n_descartables` viaja hasta
  // `confianza.ts`, que con eso levanta `mezcla_de_productos`. Antes de este
  // fix las dos guardas devolvian `sinFiltrar` tal cual — con n_descartables en
  // 0 — y el peor caso del sistema (la busqueda trajo mayormente otra cosa)
  // salia reportado solo de rebote como dispersion de precios, que es
  // exactamente lo que este trabajo vino a dejar de hacer.
  const abstenerse: ResultadoRelevancia = {
    ...sinFiltrar,
    n_descartables: descartados.length,
  };
  if (sobreviven.length < MUESTRA_MEDIA) return abstenerse;
  if (descartados.length / listings.length > MAXIMO_DESCARTABLE) return abstenerse;

  return {
    listings: sobreviven,
    n_descartados: descartados.length,
    n_descartables: descartados.length,
    aplicado: true,
    muestra_descartada: descartados.slice(0, 3).map((l) => l.title).filter(Boolean),
  };
}

/**
 * Aplica al scrape los descartes que marco la verificacion semantica
 * (`verificarPertenencia` en lib/gemini.ts), con las MISMAS guardas que usa el
 * filtro de palabras.
 *
 * Vive aca y no en el worker a proposito: la politica de "cuanto es demasiado
 * descartar" tiene que existir una sola vez. Si el modelo se entusiasma y marca
 * media muestra, la respuesta correcta es la misma que cuando se entusiasma la
 * heuristica — abstenerse y reportar la mezcla, no achicar el mercado hasta que
 * cierre.
 *
 * Las guardas se evaluan contra el scrape ORIGINAL, no contra lo que quedo del
 * primer filtro: los dos descartes se suman y entre los dos no pueden pasarse.
 */
export function aplicarPertenencia(args: {
  /** Lo que sobrevivio al filtro de palabras. */
  listings: MLListing[];
  /** Indices marcados por el modelo, relativos a `listings`. */
  descartar: number[];
  /** Cuantas publicaciones tenia el scrape antes de todo. */
  nOriginal: number;
  /** Cuantas se habian descartado ya por palabras. */
  descartadosPrevios: number;
  /** Cuantas habia VISTO el filtro de palabras (se hayan sacado o no). */
  descartablesPrevios?: number;
  /**
   * Titulos que ya habia descartado el filtro de palabras.
   *
   * Sin esto se perdian: `sinCambios` devolvia `muestra_descartada: []` y la
   * UI quedaba diciendo "Descartamos 7 publicaciones que no eran este
   * producto" sin un solo ejemplo — un acto de fe, que es justo lo que el
   * campo existe para evitar. Y pasaba en el camino MAS comun, el de la
   * pasada semantica que no marca nada (los fixtures limpios dan 0 descartes).
   */
  muestraPrevia?: string[];
}): ResultadoRelevancia {
  const {
    listings,
    descartar,
    nOriginal,
    descartadosPrevios,
    descartablesPrevios,
    muestraPrevia,
  } = args;

  const previos = muestraPrevia ?? [];
  const descartablesAntes = descartablesPrevios ?? descartadosPrevios;

  const marcados = new Set(descartar);
  const sobreviven = listings.filter((_, i) => !marcados.has(i));
  const descartados = listings.filter((_, i) => marcados.has(i));

  const sinCambios: ResultadoRelevancia = {
    listings,
    n_descartados: descartadosPrevios,
    // La pasada semantica se ignoro, pero lo que vio sigue siendo evidencia de
    // mezcla: se suma a lo que ya habia visto el filtro de palabras.
    n_descartables: descartablesAntes + descartados.length,
    aplicado: descartadosPrevios > 0,
    muestra_descartada: previos.slice(0, 3),
  };

  if (descartados.length === 0) return sinCambios;

  // Techo propio de la pasada semantica, mas estricto que el general. El
  // modelo es la parte del sistema que puede equivocarse de forma masiva y
  // coherente — cuando se convence de un criterio equivocado lo aplica a todo
  // el scrape, que es lo que paso el 23/9 con "auriculares bluetooth" antes de
  // exigirle el motivo. Si marca mas de un cuarto de lo que recibe, se ignora
  // entero y queda lo que decidio el filtro de palabras.
  if (listings.length > 0 && descartados.length / listings.length > 0.25) return sinCambios;

  const totalDescartado = descartadosPrevios + descartados.length;
  if (sobreviven.length < MUESTRA_MEDIA) return sinCambios;
  if (nOriginal > 0 && totalDescartado / nOriginal > MAXIMO_DESCARTABLE) return sinCambios;

  return {
    listings: sobreviven,
    n_descartados: totalDescartado,
    n_descartables: descartablesAntes + descartados.length,
    aplicado: true,
    // Los titulos de la pasada semantica primero: son los que el usuario menos
    // se espera ("esto se parecia, pero no es tu producto") y los que mejor
    // explican por que la mediana no es la que veia buscando a mano.
    muestra_descartada: [
      ...descartados.map((l) => l.title).filter(Boolean),
      ...previos,
    ].slice(0, 3),
  };
}
