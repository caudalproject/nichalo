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

/** Debajo de esta cobertura de tokens, el titulo habla de otra cosa. Gobierna
 *  la rama de consultas cortas — ver `CONSULTA_LARGA`. */
const COBERTURA_MINIMA = 0.5;

/**
 * Un termino de RUIDO precedido por una de estas palabras es una
 * CARACTERISTICA del producto, no el producto.
 *
 * "Aspiradora Portatil 8000pa **Con Filtro** Hepa" es una aspiradora que
 * incluye filtro. "Filtro Hepa Repuesto Para Aspiradora" es un filtro. La
 * unica diferencia entre las dos esta en la palabra de adelante, y hasta el
 * 24/9 el filtro no la miraba: hacia `tituloNorm.includes("filtro")` y las
 * descartaba a las dos.
 *
 * Medido sobre el caso del 24/9 (aspiradora inalambrica de mano): de las 4
 * publicaciones legitimas que el filtro tiraba, las 4 morian aca y ninguna por
 * cobertura. "filtro", "cable" y "accesorios" son partes de la descripcion de
 * una aspiradora — es el vocabulario normal de la categoria.
 */
const PREFIJOS_CARACTERISTICA = new Set([
  "con", "incluye", "incluido", "incluidos", "mas", "y", "e", "+", "&",
]);

/**
 * Un termino de RUIDO seguido de cerca por una de estas es un accesorio
 * declarado: "repuesto PARA", "cabezales COMPATIBLE con".
 */
const SUFIJOS_ACCESORIO = new Set(["para", "compatible", "compatibles"]);

/**
 * Cuantas palabras del principio del titulo cuentan como "el producto que se
 * esta vendiendo". En Mercado Libre el sustantivo principal va adelante:
 * "Cargador Usb Repuesto Para Aspiradora" vende un cargador, y lo dice en la
 * primera palabra.
 */
const CABEZA_TITULO = 3;

/**
 * Palabras que dicen COMO es el producto, no QUE es.
 *
 * EL BUG QUE ESTO CIERRA (24/9). La cobertura se medía contra la UNION de los
 * tokens del texto tipeado y los de la keyword de la foto, con un piso de 50%.
 * Eso hacia que **ser mas especifico empeorara el analisis**, que es el reves
 * exacto de lo que el sistema promete:
 *
 *   "Aspiradora inalambrica mini de alta potencia para hogar y automovil"
 *   -> 7 tokens utiles + 2 de la keyword = 9. Una publicacion legitima como
 *      "Aspiradora Inalambrica Portatil 120w" cubre 4 de 9 = 0,44 y se
 *      descartaba POR NO SER EL PRODUCTO. Pasado el 40% descartable el filtro
 *      se abstenia entero, `confianza.ts` levantaba `mezcla_de_productos` y el
 *      score quedaba capeado en 60.
 *
 * El usuario habia pegado el titulo completo del listing — el input mas rico
 * posible — y el filtro lo leyo como ruido. La causa es aritmetica: cada
 * adjetivo que se agrega sube el denominador y ninguna publicacion real usa
 * los siete.
 *
 * La separacion nucleo/modificador la arregla de raiz: "aspiradora" dice que
 * es; "mini", "inalambrica", "alta", "potencia", "hogar" y "automovil" dicen
 * como es. Los segundos no pueden descartar a nadie por su ausencia — ningun
 * vendedor escribe los seis — pero suman cuando estan.
 *
 * Deliberadamente corta y solo con adjetivos que NUNCA son el producto. Ante
 * la duda, afuera: una palabra de mas aca debilita el nucleo, y un nucleo
 * debil es el bug de arriba otra vez. Por eso no estan "cable" (es el nucleo
 * de "organizador de cables"), "escritorio" ni "bateria".
 */
const MODIFICADORES = new Set([
  // Tamano y forma
  "mini", "micro", "maxi", "chico", "chica", "grande", "pequeno", "pequena",
  "compacto", "compacta", "portatil", "plegable", "ajustable", "regulable",
  "liviano", "liviana", "delgado", "delgada",
  // Alimentacion y conectividad
  "inalambrico", "inalambrica", "recargable", "electrico", "electrica",
  "usb", "bluetooth", "wireless", "automatico", "automatica", "digital",
  "inteligente", "smart",
  // Prestaciones
  "alta", "alto", "baja", "bajo", "potencia", "velocidad", "resistente",
  "impermeable", "silencioso", "silenciosa", "profesional", "industrial",
  "ergonomico", "ergonomica", "gamer", "deportivo", "deportiva",
  // Destino de uso
  "hogar", "casa", "auto", "automovil", "coche", "carro", "oficina", "viaje",
  // Color
  "negro", "negra", "blanco", "blanca", "gris", "azul", "rojo", "roja",
  "verde", "rosa", "rosado", "dorado", "plateado", "transparente",
]);

/**
 * Cuantos tokens de la consulta tiene que tener un titulo para no ser
 * descartado.
 *
 * Es un ABSOLUTO, no una proporcion, y esa es toda la diferencia: una
 * proporcion crece con lo que el usuario escribe y castiga la especificidad.
 * Dos coincidencias — una de ellas del nucleo — significan lo mismo en una
 * consulta de tres palabras que en una de nueve.
 *
 * Con consultas cortas el comportamiento es identico al anterior: 0,5 sobre 3
 * o 4 tokens ya exigia 2. Verificado contra los 10 fixtures del golden set.
 */
const MINIMO_COINCIDENCIAS = 2;

/**
 * A partir de cuantos tokens la consulta se considera larga y cambia la regla.
 *
 * POR QUE HAY DOS REGLAS Y NO UNA. La primera version de este fix aplicaba el
 * umbral absoluto y el cerco de nucleo a todas las consultas, y el golden set
 * lo rechazo en el acto: con "auriculares bluetooth" (2 tokens) exigir dos
 * coincidencias obliga a que el titulo diga las DOS palabras, y se llevaba
 * puestos "Auriculares inalambricos Lenovo ThinkPlus XT80" y "Auriculares Jbl
 * Wave Beam 2" — 10 de 30, la competencia real. Es el mismo falso positivo que
 * el comentario del token obligatorio documenta mas arriba.
 *
 * La proporcion NO esta rota en consultas cortas: con 3 o 4 tokens, 0,5 ya
 * pide 2 y tolera un sinonimo. Se rompe cuando la consulta crece, porque el
 * denominador sube y ninguna publicacion real usa las nueve palabras.
 *
 * Y el cerco de nucleo es mas seguro justamente ahi: una consulta larga aporta
 * varios candidatos a nucleo, asi que fallar UNO por sinonimo (el caso
 * "lavadora"/"lavarropa") no alcanza para descartar la publicacion. Con dos
 * tokens, el unico nucleo que hay es un punto unico de falla.
 *
 * 5 es donde empieza lo que la regla vieja no sabe manejar y donde termina lo
 * que el golden set valida. Los 10 fixtures tienen 4 tokens o menos: entran
 * todos por la rama de siempre y su salida es identica, byte por byte.
 */
const CONSULTA_LARGA = 5;

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

/**
 * El mismo techo, pero para consultas largas.
 *
 * El techo general esta calibrado contra un filtro PROPORCIONAL, cuyo modo de
 * falla es masivo: si el criterio esta mal, esta mal para todo el scrape a la
 * vez. La rama larga no falla asi. Falla cuando el vendedor usa un sinonimo
 * del nucleo, y una consulta larga aporta VARIOS candidatos a nucleo, asi que
 * errarle a uno no alcanza para descartar la publicacion. Es un filtro mas
 * confiable y se le puede dar mas cuerda.
 *
 * Lo que no se toca es `MUESTRA_MEDIA`: esa guarda protege el tamano de la
 * muestra, que es lo que de verdad no se puede negociar, y sigue corriendo
 * igual para las dos ramas.
 *
 * Sin esto el caso del 24/9 seguia saliendo roto por medio punto: 13 de 30
 * publicaciones eran genuinamente otra cosa (sopladores de jardin, repuestos,
 * un robot, una industrial) = 0,433, el filtro se abstenia por pasarse de
 * 0,40 y el analisis salia con los sopladores adentro.
 */
const MAXIMO_DESCARTABLE_LARGA = 0.5;

/**
 * Techo propio de la pasada semantica, mas estricto que el general.
 *
 * Estaba escrito a mano como `0.25` adentro de `aplicarPertenencia`. Un umbral
 * que hace que el sistema se abstenga tiene que tener nombre: es lo primero que
 * se va a querer mover cuando haya datos, y un literal suelto no se encuentra
 * buscando por "umbral".
 */
const MAXIMO_SEMANTICO = 0.25;

/**
 * Deja rastro de cada abstencion.
 *
 * POR QUE. Las guardas de este archivo son la parte del sistema que decide NO
 * actuar, y hasta hoy no dejaban registro de nada: cuando se activaban, el
 * analisis salia sin filtrar y era indistinguible de uno donde no habia nada
 * que filtrar. El dia que haya que calibrar `MAXIMO_SEMANTICO` o
 * `MAXIMO_DESCARTABLE` — que es el dia que se sepa si son conservadores o
 * flojos — no habria con que. Mismo agujero que el `catch {}` mudo de
 * `extractKeywordsFromImage` que se cerro en `8d73f42`.
 *
 * Es `warn` y no `error`: abstenerse es el comportamiento correcto de la
 * guarda, no una falla. Y es una sola linea greppeable por `[relevancia]`
 * porque el consumidor es una consulta sobre los logs de Inngest, no un humano
 * leyendo la corrida.
 */
function registrarAbstencion(args: {
  guarda: string;
  producto?: string;
  nEvaluados: number;
  nDescartables: number;
  sobreviven: number;
  muestra: string[];
}): void {
  const { guarda, producto, nEvaluados, nDescartables, sobreviven, muestra } = args;
  const ratio = nEvaluados > 0 ? Math.round((nDescartables / nEvaluados) * 100) / 100 : 0;
  console.warn(
    `[relevancia] abstencion guarda=${guarda} producto=${JSON.stringify(producto ?? "")} ` +
      `n_evaluados=${nEvaluados} n_descartables=${nDescartables} ratio=${ratio} ` +
      `sobreviven=${sobreviven} muestra=${JSON.stringify(muestra.slice(0, 3))}`
  );
}

/** Normaliza para comparar: sin tildes, sin puntuacion, en minuscula. */
export function normalizar(texto: string): string {
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

/**
 * Palabras con contenido del texto, SIN stemming y en el orden original.
 *
 * `tokenizar` no sirve para esto: aplica `raiz()`, que es lo correcto para
 * comparar dos titulos y lo incorrecto para armar una consulta que se le manda
 * a Mercado Libre — nadie busca "auricular inalambric". Esta devuelve las
 * palabras como el usuario las escribio, que es el unico vocabulario con el
 * que `lib/termino.ts` tiene permitido armar una busqueda.
 */
export function palabrasContenido(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length >= 3 && !VACIAS.has(t));
}

/** Si la palabra dice COMO es el producto y no QUE es. Ver `MODIFICADORES`. */
export function esModificador(palabra: string): boolean {
  return MODIFICADORES.has(raiz(normalizar(palabra)));
}

/**
 * Si dos palabras se refieren a lo mismo, con la misma tolerancia a plural y
 * genero que usa el filtro de titulos. Exportada para que `lib/termino.ts`
 * decida con el MISMO criterio si el modelo introdujo una palabra nueva: dos
 * nociones distintas de "palabra nueva" en el mismo pipeline serian una
 * fuente de bugs silenciosos.
 */
export function coincide(a: string, b: string): boolean {
  return contiene([raiz(normalizar(a))], raiz(normalizar(b)));
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
 * Decide si un termino de RUIDO presente en el titulo es evidencia de que la
 * publicacion es OTRA COSA, o solo una palabra de la descripcion.
 *
 * Es estrictamente mas permisivo que el `tituloNorm.includes(r)` que
 * reemplaza: para descartar exige que el termino ademas este en posicion de
 * producto. O sea que solo puede devolver `false` donde antes se descartaba —
 * nunca puede sacar una publicacion que antes sobrevivia. Esa es la propiedad
 * que hace que este cambio no pueda introducir falsos positivos nuevos.
 *
 * @param crudos tokens del titulo normalizado SIN sacar palabras vacias: la
 *               decision se apoya justamente en "con" y "para".
 */
function ruidoEnPosicionDeProducto(crudos: string[], ruido: string): boolean {
  const partes = normalizar(ruido).split(" ").filter(Boolean);
  if (partes.length === 0) return false;

  for (let i = 0; i + partes.length <= crudos.length; i++) {
    let coincide = true;
    for (let j = 0; j < partes.length; j++) {
      if (crudos[i + j] !== partes[j]) {
        coincide = false;
        break;
      }
    }
    if (!coincide) continue;

    // "con filtro hepa" — el producto lo INCLUYE, no lo ES.
    const anterior = crudos[i - 1];
    if (anterior && PREFIJOS_CARACTERISTICA.has(anterior)) continue;

    // Posicion de sustantivo principal: "Cargador Usb Repuesto Para...".
    if (i < CABEZA_TITULO) return true;

    // "repuesto para", "cabezales compatible con".
    const siguientes = crudos.slice(i + partes.length, i + partes.length + 3);
    if (siguientes.some((t) => SUFIJOS_ACCESORIO.has(t))) return true;
  }

  return false;
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

  // QUE es el producto, separado de COMO es. Ver el comentario de
  // `MODIFICADORES`: sin esta separacion, cada adjetivo que el usuario agrega
  // sube el denominador de la cobertura y hace que sus propias publicaciones
  // legitimas dejen de calificar.
  const nucleo = tokens.filter((t) => !MODIFICADORES.has(t));

  // Una consulta corta sigue por la regla proporcional de siempre. Larga, por
  // la nueva. Ver `CONSULTA_LARGA`.
  const esLarga = tokens.length >= CONSULTA_LARGA;
  const umbral = Math.min(MINIMO_COINCIDENCIAS, tokens.length);

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

    const tituloCrudos = normalizar(titulo).split(" ").filter(Boolean);
    const tituloRaices = tokenizar(titulo);

    const presentes = tokens.filter((t) => contiene(tituloRaices, t)).length;
    const presentesNucleo = nucleo.filter((t) => contiene(tituloRaices, t)).length;
    const cobertura = tokens.length > 0 ? presentes / tokens.length : 1;
    const tieneRuido = ruidoActivo.some((r) =>
      ruidoEnPosicionDeProducto(tituloCrudos, r)
    );

    // Dos condiciones, y las dos tienen que dar.
    //
    // 1. COINCIDENCIAS SUFICIENTES. Absoluto, no proporcional: agregar
    //    adjetivos ya no sube la vara.
    // 2. AL MENOS UNA ES DEL NUCLEO. Sin esto, "Mini Ventilador Portatil
    //    Hogar" pasaria un pedido de aspiradora con solo "mini" + "hogar":
    //    dos coincidencias, cero producto. El nucleo es lo que impide que un
    //    titulo entre por los adjetivos.
    //
    // Si la consulta es toda modificadores (`nucleo` vacio) no se exige el
    // segundo cerco: no hay contra que exigirlo y abstenerse es mas barato
    // que inventar un nucleo.
    //
    // Cobertura total sigue ganandole al ruido: "almohadilla electrica
    // cervical con funda lavable" ES el producto, y la funda es una
    // caracteristica.
    const cubre = esLarga
      ? presentes >= umbral && (nucleo.length === 0 || presentesNucleo >= 1)
      : cobertura >= COBERTURA_MINIMA;

    const esRelevante = cubre && (!tieneRuido || cobertura === 1);

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
  const muestraDescartada = descartados.slice(0, 3).map((l) => l.title).filter(Boolean) as string[];

  if (sobreviven.length < MUESTRA_MEDIA) {
    registrarAbstencion({
      guarda: "muestra_minima",
      producto,
      nEvaluados: listings.length,
      nDescartables: descartados.length,
      sobreviven: sobreviven.length,
      muestra: muestraDescartada,
    });
    return abstenerse;
  }
  const techoDescartable = esLarga ? MAXIMO_DESCARTABLE_LARGA : MAXIMO_DESCARTABLE;
  if (descartados.length / listings.length > techoDescartable) {
    registrarAbstencion({
      guarda: "techo_general",
      producto,
      nEvaluados: listings.length,
      nDescartables: descartados.length,
      sobreviven: sobreviven.length,
      muestra: muestraDescartada,
    });
    return abstenerse;
  }

  return {
    listings: sobreviven,
    n_descartados: descartados.length,
    n_descartables: descartados.length,
    aplicado: true,
    muestra_descartada: muestraDescartada,
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
  /** Solo para el log de abstencion: sin el termino no se puede calibrar nada. */
  producto?: string;
}): ResultadoRelevancia {
  const {
    listings,
    descartar,
    nOriginal,
    descartadosPrevios,
    descartablesPrevios,
    muestraPrevia,
    producto,
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

  const muestraSemantica = descartados.map((l) => l.title).filter(Boolean) as string[];
  const abstenerse = (guarda: string, sobrevivientes: number) => {
    registrarAbstencion({
      guarda,
      producto,
      nEvaluados: listings.length,
      nDescartables: descartados.length,
      sobreviven: sobrevivientes,
      muestra: muestraSemantica,
    });
    return sinCambios;
  };

  // Techo propio de la pasada semantica, mas estricto que el general
  // (`MAXIMO_SEMANTICO`). El modelo es la parte del sistema que puede
  // equivocarse de forma masiva y coherente — cuando se convence de un criterio
  // equivocado lo aplica a todo el scrape, que es lo que paso el 23/9 con
  // "auriculares bluetooth" antes de exigirle el motivo. Si marca mas de un
  // cuarto de lo que recibe, se ignora entero y queda lo que decidio el filtro
  // de palabras.
  //
  // El numero se eligio contra un caso, no contra una distribucion. El log es
  // lo unico que va a decir si 0,25 corta demasiado pronto: cada abstencion
  // reporta el ratio real, asi que se puede ver la forma de lo que se esta
  // rechazando antes de mover el umbral.
  if (listings.length > 0 && descartados.length / listings.length > MAXIMO_SEMANTICO) {
    return abstenerse("techo_semantico", sobreviven.length);
  }

  const totalDescartado = descartadosPrevios + descartados.length;
  if (sobreviven.length < MUESTRA_MEDIA) {
    return abstenerse("muestra_minima_semantica", sobreviven.length);
  }
  if (nOriginal > 0 && totalDescartado / nOriginal > MAXIMO_DESCARTABLE) {
    return abstenerse("techo_general_semantico", sobreviven.length);
  }

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
