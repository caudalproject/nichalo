/**
 * Barrido de Google Trends para el area de tendencias — TAB 7 (24/9/2026).
 *
 * Genera `data/tendencias.json`, que es lo unico que `/tendencias` lee. La
 * seccion publica NO llama a Google: ver el encabezado de `lib/tendencias.ts`.
 *
 * POR QUE ES LENTO A PROPOSITO
 *
 * Google Trends rate-limitea, y no avisa con un 429 limpio: devuelve HTML y el
 * JSON.parse muere con `Unexpected token 'L', "L><HEAD><m"`. Verificado el
 * 24/9 haciendo ~40 consultas en 15 minutos. Por eso hay 8 segundos entre
 * llamadas y backoff exponencial ante el primer HTML. Correr esto rapido es
 * correrlo mal: te ganas un bloqueo de media hora.
 *
 * ES REANUDABLE, Y ESA ES LA PARTE IMPORTANTE
 *
 * Mergea contra el JSON que ya existe. Un producto que falla conserva sus datos
 * viejos en vez de borrarlos. Se puede correr varias veces hasta completar el
 * barrido sin perder lo ya conseguido, que es exactamente lo que hace falta
 * cuando la fuente te corta a mitad de camino.
 *
 * EL FILTRO DE RUIDO NO ES OPINION
 *
 * Cada regla sale de basura concreta que devolvio Google el 24/9 en AR. Esta
 * anotada caso por caso abajo. Reusa `normalizar` de `lib/relevancia.ts` en
 * vez de reimplementar la normalizacion de texto que ese archivo ya resolvio.
 *
 * Uso:
 *   npx tsx scripts/barrer-tendencias.mjs
 *   npx tsx scripts/barrer-tendencias.mjs --nicho mascotas   (solo uno)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { NICHOS } from "../lib/tendencias.ts";
import { normalizar } from "../lib/relevancia.ts";

const require = createRequire(import.meta.url);
const googleTrends = require("google-trends-api");

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = resolve(RAIZ, "data/tendencias.json");
/** Los descartes del filtro, enteros, para poder auditarlos. No se commitea. */
const DESCARTES = resolve(RAIZ, "data/descartes-tendencias.txt");

const GEO = "AR";
const VENTANA_DIAS = 365;
const PAUSA_MS = 8000;
const REINTENTOS = 3;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const desde = (dias) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

/**
 * Llama a Google y distingue "no hay datos" de "me estan bloqueando".
 * Es la diferencia que el `catch {}` de `getGoogleTrends` borra hoy en
 * produccion, haciendo pasar un bloqueo por una ausencia de tendencia.
 */
async function consultar(metodo, params, etiqueta) {
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    let bloqueo = false;
    try {
      const crudo = await googleTrends[metodo](params);
      // La libreria a veces devuelve el HTML crudo y a veces revienta ella
      // misma al parsearlo. Los dos caminos significan lo mismo — bloqueado —
      // y los dos hay que cubrir: confiar solo en el string devuelto hace que
      // el script crashee justo cuando Google corta, que es cuando mas
      // importa que siga en pie.
      if (typeof crudo === "string" && !crudo.trimStart().startsWith("{")) {
        bloqueo = true;
      } else {
        return { bloqueado: false, datos: JSON.parse(crudo) };
      }
    } catch (e) {
      // Cualquier fallo de la consulta es reintentable, no solo el HTML del
      // bloqueo. El primer barrido del 24/9 murio con ECONNRESET en el ultimo
      // nicho porque aca solo se capturaba SyntaxError: una conexion cortada
      // por el otro lado tiraba abajo el proceso entero despues de 12 minutos
      // de esquivar el rate limit. Un barrido lento contra una fuente que te
      // corta tiene que asumir que la red tambien falla.
      bloqueo = true;
      if (intento === 1) {
        console.warn(`   ⚠ fallo de red en ${etiqueta}: ${String(e.message ?? e).slice(0, 80)}`);
      }
    }

    if (!bloqueo) return { bloqueado: true, datos: null };

    const espera = 60000 * 2 ** (intento - 1);
    if (intento === REINTENTOS) {
      console.warn(`   ⚠ bloqueado por Google en ${etiqueta}, me rindo con este.`);
      return { bloqueado: true, datos: null };
    }
    console.warn(
      `   ⚠ bloqueado por Google en ${etiqueta} (intento ${intento}/${REINTENTOS}). Espero ${espera / 1000}s...`
    );
    await dormir(espera);
  }
  return { bloqueado: true, datos: null };
}

/** Prefijos de busqueda informativa: el que pregunta no esta por comprar. */
const PREFIJOS_INFORMATIVOS = [
  "como", "que es", "qué es", "cuanto", "cuánto", "por que", "por qué",
  "donde", "dónde", "cual", "cuál", "para que", "para qué", "cuando", "cuándo",
];
/** Palabras que delatan contenido, no producto. `colchon de arvejas receta`. */
const PALABRAS_CONTENIDO_NO_COMERCIAL = ["receta", "recetas", "significado", "letra", "wikipedia"];
/** Ingles: Google mezcla queries de otros mercados. `what is a smartwatch`. */
const PALABRAS_INGLES = ["what", "best", "how", "the", "review", "vs", "near me", "for sale"];
/**
 * Se buscan mucho, pero no son algo que puedas comprar y revender en ML.
 * Casos reales del 24/9: "veterinaria" salio dentro de "accesorios para
 * perros"; "usina cafetera villa urquiza" y "camping mar del plata" son un bar
 * y un destino. Lista corta y explicita a proposito: la version generalizada
 * de esta idea fue el filtro de pertenencia que descarto todas las marcas.
 */
const SERVICIOS_Y_LUGARES = [
  "veterinaria", "veterinarias", "peluqueria", "taller", "curso", "cursos",
  "empleo", "trabajo", "alquiler", "usados", "usado", "segunda",
  "gratis", "pdf", "juego", "juegos", "pelicula", "serie", "cancion", "letra",
];

/**
 * Descarta lo que no es un producto que alguien pueda salir a vender.
 * Devuelve el motivo para poder auditarlo, no solo un booleano.
 */
function motivoDescarte(query, semilla) {
  const n = normalizar(query);

  // 1. Titulos de publicacion que Google indexo enteros. Caso real:
  //    "cafetera expreso cuk by gadnic cm5600 semi automatica 20 bar con
  //    espumador de leche" — es UNA publicacion, no una tendencia.
  if (query.length > 60) return "titulo de publicacion";

  // 2. Busqueda informativa. Casos reales: "como hacer huevos en la freidora
  //    de aire", "skincare que es", "cuanto mide un colchon de 1 plaza".
  if (PREFIJOS_INFORMATIVOS.some((p) => n === p || n.startsWith(`${p} `))) {
    return "busqueda informativa";
  }
  if (PALABRAS_CONTENIDO_NO_COMERCIAL.some((p) => n.split(" ").includes(p))) {
    return "contenido, no producto";
  }

  // 3. Otro idioma / otro mercado. Casos reales en "smartwatch":
  //    "what is a smartwatch", "best smartwatch faces".
  if (PALABRAS_INGLES.some((p) => n.split(" ").includes(p))) return "otro idioma";

  // 4. Servicios y lugares: se buscan, pero no se venden en Mercado Libre.
  //
  //    ESTA REGLA REEMPLAZA A UN FILTRO DE PERTENENCIA LEXICA QUE ESTABA MAL.
  //
  //    El primer intento exigia que la query compartiera alguna palabra de
  //    contenido con la semilla, copiando el criterio de `lib/relevancia.ts`.
  //    Ahi ese criterio es correcto — una funda no es el producto — pero aca
  //    descarto 112 terminos, y entre ellos estaba lo mejor que habia:
  //    `jbl` y `sony` dentro de "parlante bluetooth", `garmin`, `amazfit` y
  //    `xiaomi redmi watch 5` dentro de "smartwatch", y `reloj inteligente`,
  //    que es el sinonimo literal de la semilla.
  //
  //    El error de fondo: `relatedQueries` YA garantiza la relacion semantica.
  //    Pedir ademas parentesco de palabras descarta toda marca, y en una
  //    seccion de tendencias **la marca que sube ES la tendencia**.
  //
  //    Queda entonces una lista corta y explicita en vez de una regla general.
  //    Se paga dejando pasar algun termino flojo; se gana no tirar la señal.
  if (SERVICIOS_Y_LUGARES.some((p) => n.split(" ").includes(p))) {
    return "servicio o lugar";
  }

  // 5. USO DEL PRODUCTO, NO EL PRODUCTO.
  //
  //    Una regla que cubre dos familias de ruido que parecian distintas:
  //    recetas ("flan EN freidora de aire", "budin de mandarina EN licuadora",
  //    "licuado SIN licuadora") y rutinas de gimnasio ("press militar sentado
  //    CON mancuernas", "pajaros CON mancuernas"). En las dos, la semilla
  //    aparece precedida de en/con/sin: el que busca eso ya tiene el aparato y
  //    quiere saber que hacer con el. No es un comprador.
  //
  //    Solo aplica si la query NO empieza con la semilla, para no matar
  //    "freidora de aire con doble canasta", que si es un producto.
  const nSemilla = normalizar(semilla);
  if (!n.startsWith(nSemilla) && new RegExp(`\\b(en|con|sin)\\s+(el\\s+|la\\s+|los\\s+|las\\s+)?${nSemilla}\\b`).test(n)) {
    return "uso, no producto";
  }

  // 6. Traducciones. "cinta de correr en ingles", "secador de pelo en ingles".
  if (/\ben (ingles|frances|portugues|aleman|italiano)\b/.test(n)) return "traduccion";

  // 7. Basura literal de Google. Devuelve la query "product" con +1.200% en
  //    "proteina whey" y Breakout en "crema facial": no significa nada.
  if (n === "product" || n === "products" || n.length < 3) return "basura de la fuente";

  // 8. La semilla repetida no es una tendencia, es la pregunta.
  if (n === normalizar(semilla)) return "es la semilla";

  return null;
}

function limpiar(rankedKeyword, semilla, descartados) {
  return (rankedKeyword ?? [])
    .map((k) => ({
      termino: String(k.query ?? "").trim(),
      variacion: String(k.formattedValue ?? ""),
      valor: Number(k.value ?? 0),
    }))
    .filter((t) => {
      if (!t.termino) return false;
      const motivo = motivoDescarte(t.termino, semilla);
      if (motivo) {
        descartados.push(`${t.termino} → ${motivo}`);
        return false;
      }
      return true;
    })
    .slice(0, 6);
}

async function barrerProducto(producto, descartados) {
  const params = {
    keyword: producto,
    geo: GEO,
    startTime: desde(VENTANA_DIAS),
    endTime: new Date(),
  };

  const iot = await consultar("interestOverTime", params, `serie de "${producto}"`);
  await dormir(PAUSA_MS);
  const rq = await consultar("relatedQueries", params, `relacionadas de "${producto}"`);

  if (iot.bloqueado && rq.bloqueado) return { bloqueado: true, datos: null };

  const timeline = iot.datos?.default?.timelineData ?? [];
  const interes = timeline.map((t) => ({
    fecha: String(t.formattedTime ?? ""),
    valor: Number(t.value?.[0] ?? 0),
  }));

  let variacionAnual = null;
  if (interes.length >= 16) {
    const v = interes.map((p) => p.valor);
    const viejo = v.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
    const nuevo = v.slice(-8).reduce((a, b) => a + b, 0) / 8;
    if (viejo > 0) variacionAnual = Math.round((nuevo / viejo - 1) * 100);
  }

  const rankedList = rq.datos?.default?.rankedList ?? [];

  return {
    bloqueado: false,
    datos: {
      producto,
      // rankedList[1] = rising/breakout. Es el insumo central del tab y la
      // razon por la que la ventana de 12 meses no es negociable.
      subiendo: limpiar(rankedList[1]?.rankedKeyword, producto, descartados),
      masBuscado: limpiar(rankedList[0]?.rankedKeyword, producto, descartados),
      interes,
      variacionAnual,
    },
  };
}

function guardar(nichos) {
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(
    SALIDA,
    JSON.stringify(
      { generado: new Date().toISOString(), ventanaDias: VENTANA_DIAS, geo: GEO, nichos },
      null,
      2
    ) + "\n"
  );
}

async function main() {
  const filtroNicho = process.argv.includes("--nicho")
    ? process.argv[process.argv.indexOf("--nicho") + 1]
    : null;

  const previo = existsSync(SALIDA)
    ? JSON.parse(readFileSync(SALIDA, "utf8"))
    : { nichos: [] };
  const previoPorSlug = new Map((previo.nichos ?? []).map((n) => [n.slug, n]));

  const descartados = [];
  const resultado = [];
  let bloqueos = 0;
  let conservados = 0;

  for (const def of NICHOS) {
    if (filtroNicho && def.slug !== filtroNicho) {
      const anterior = previoPorSlug.get(def.slug);
      if (anterior) resultado.push(anterior);
      continue;
    }

    console.log(`\n▸ ${def.nombre}`);
    const anterior = previoPorSlug.get(def.slug);
    const productos = [];

    for (const producto of def.productos) {
      const { bloqueado, datos } = await barrerProducto(producto, descartados);

      if (bloqueado) {
        bloqueos++;
        const viejo = (anterior?.productos ?? []).find((p) => p.producto === producto);
        if (viejo) {
          conservados++;
          productos.push(viejo);
          console.log(`   • ${producto}: bloqueado, conservo el dato anterior`);
        } else {
          console.log(`   • ${producto}: bloqueado, SIN dato previo`);
        }
      } else {
        productos.push(datos);
        console.log(
          `   • ${producto}: ${datos.subiendo.length} subiendo · ${datos.masBuscado.length} mas buscado · ${datos.interes.length} pts · ${datos.variacionAnual ?? "?"}%`
        );
      }
      await dormir(PAUSA_MS);
    }

    resultado.push({
      slug: def.slug,
      nombre: def.nombre,
      descripcion: def.descripcion,
      productos,
    });

    // Se guarda despues de CADA nicho, no al final. El barrido tarda ~15
    // minutos y corre contra una fuente que corta: dejar la escritura para el
    // final significa que cualquier fallo en el ultimo nicho tira todo lo
    // anterior. Paso exactamente eso el 24/9 y costo el barrido entero.
    //
    // Los nichos que todavia no se recorrieron se arrastran del archivo previo
    // para no dejarlos fuera del JSON mientras el barrido esta a mitad.
    const pendientes = NICHOS.slice(resultado.length)
      .map((d) => previoPorSlug.get(d.slug))
      .filter(Boolean);
    guardar([...resultado, ...pendientes]);
  }

  guardar(resultado);

  const conDatos = resultado.filter((n) =>
    n.productos.some((p) => p.subiendo.length || p.masBuscado.length)
  );

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Escrito: data/tendencias.json`);
  console.log(`Nichos con datos: ${conDatos.length}/${resultado.length}`);
  console.log(`Bloqueos de Google: ${bloqueos} (conservados de un barrido previo: ${conservados})`);
  console.log(`Descartados por el filtro de ruido: ${descartados.length}`);
  if (descartados.length) {
    // La lista entera va a un archivo, no solo las primeras 25 lineas a la
    // consola. El 24/9 el filtro descarto 112 terminos y el recorte tapaba
    // que entre ellos estaban todas las marcas (jbl, sony, garmin): el error
    // se vio igual, pero por suerte, y esa no es forma de auditar un filtro.
    writeFileSync(DESCARTES, descartados.join("\n") + "\n");
    console.log(`\nMIRA ESTA LISTA (entera en ${DESCARTES.replace(RAIZ + "/", "")}).`);
    console.log(`Si hay un producto legitimo, el filtro tiene un falso positivo:`);
    for (const d of descartados.slice(0, 20)) console.log(`   ✕ ${d}`);
    if (descartados.length > 20) console.log(`   … y ${descartados.length - 20} mas en el archivo`);
  }
  if (bloqueos) {
    console.log(`\nHubo bloqueos. Espera ~30 min y volve a correr: es reanudable.`);
  }
}

main().catch((e) => {
  console.error("Barrido fallido:", e);
  process.exit(1);
});
