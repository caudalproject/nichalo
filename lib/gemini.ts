import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScrapeResult } from "./apify";
import type { AnalysisResult } from "./supabase";
import type { Confianza, PrecioStats } from "./confianza";
import { explicarScore, type ScoreCalculado } from "./score";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash-latest"] as const;

interface DatosPro {
  origen_producto?: string | null;
  presupuesto_inicial?: number | null;
  tiene_variantes?: string | null;
  detalle_variantes?: string | null;
  canal_distribucion?: string | null;
}

interface AnalyzeArgs {
  producto: string;
  pais: "AR" | "MX" | "CO";
  costoEstimadoUsd: number;
  scrape: ScrapeResult;
  imagenBase64?: string;
  imagenMimeType?: string;
  currency?: { code: string; symbol: string; name: string };
  exchangeRate?: number;
  perfilVendedor?: string;
  // "total" (tamaño total del mercado en ML) se saco el 20/9 (TAB 1): la API
  // publica que lo daba devuelve 403 desde que ML cerro el acceso sin token,
  // y fallaba en silencio via catch => 0. Google Trends sigue siendo la unica
  // fuente viva de esta familia de datos.
  mlData?: {
    trends?: { trending: boolean; interest: number; related: string[] };
  };
  datosPro?: DatosPro;
  precioStats?: PrecioStats | null;
  confianza?: Confianza | null;
  /** Calculado en lib/score.ts ANTES de esta llamada. El modelo no lo produce:
   *  lo recibe ya hecho y su trabajo es explicarlo. Ver TAB 3 (20/9). */
  score: ScoreCalculado;
}

export async function extractKeywordsFromImage(
  imagenBase64: string,
  mimeType: string = "image/jpeg"
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = `Analizá esta imagen de producto y generá entre 3 y 5 keywords descriptivas en español que un comprador usaría para buscarlo en Mercado Libre.
Devolvé SOLO las keywords separadas por coma, sin explicación, sin markdown.
Ejemplo: lámpara sal rosa, luz ambiente sal, lámpara himalaya decorativa`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel(
        { model: modelName },
        { apiVersion: "v1" }
      );
      const result = await model.generateContent([
        { inlineData: { mimeType, data: imagenBase64 } },
        { text: prompt },
      ]);
      const text = result.response.text().trim();
      if (!text) continue;
      const first = text.split(",")[0].trim();
      return first || null;
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      const is503 = e?.message?.includes("503") || e?.status === 503;
      const isLast = modelName === MODELS[MODELS.length - 1];
      if (is503 && !isLast) continue;
      return null;
    }
  }
  return null;
}

export async function analizarConGemini(
  args: AnalyzeArgs
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);

  const promptText = buildPrompt(args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: promptText }];

  if (args.imagenBase64) {
    parts.push({
      inlineData: {
        mimeType: args.imagenMimeType ?? "image/jpeg",
        data: args.imagenBase64,
      },
    });
  }

  for (const modelName of MODELS) {
    try {
      console.log("[gemini] calling model", modelName);
      // responseMimeType only exists in v1beta; v1 enforces JSON via the prompt
      const model = genAI.getGenerativeModel(
        { model: modelName, generationConfig: { temperature: 0.2 } },
        { apiVersion: "v1" }
      );

      const result = await model.generateContent(parts);
      const text = result.response.text();
      console.log("[gemini] raw response length", text?.length ?? 0);

      if (!text) throw new Error("Gemini devolvió respuesta vacía");

      const parsed = extractJson(text);
      if (!parsed) throw new Error(`Gemini no devolvió JSON válido. Respuesta: ${text.slice(0, 200)}`);

      return normalizeAnalysis(parsed, args);
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      const is503 = e?.message?.includes("503") || e?.status === 503;
      const isLastModel = modelName === MODELS[MODELS.length - 1];
      if (is503 && !isLastModel) {
        console.log(`[gemini] ${modelName} dio 503, intentando con fallback...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error("No se pudo completar el análisis con ningún modelo");
}

function buildPrompt({ producto, pais, costoEstimadoUsd, scrape, imagenBase64, currency, exchangeRate, perfilVendedor, mlData, datosPro, precioStats, confianza, score }: AnalyzeArgs) {
  const sample = scrape.listings.slice(0, 50);
  const currencyCode = currency?.code ?? "ARS";
  const perfil = perfilVendedor ?? "principiante";
  // La tasa resuelve a 1 desde la migracion a ARS-only del 13/9 (ver
  // lib/currency.ts). Hasta el 20/9 el prompt arrastraba ~20 lineas pidiendole
  // al modelo que "convirtiera dividiendo por 1", con un ejemplo que decia
  // "si precio_sugerido = 25 ARS y costo = 10 USD". Eran instrucciones
  // contradictorias que el modelo tenia que reconciliar en cada corrida —
  // candidato real a ruido. El costo entra una sola vez, ya en moneda local.
  const costoLocal = Math.round(costoEstimadoUsd * (exchangeRate ?? 1));

  const preciosCalculados = precioStats ? `
ESTADÍSTICAS DE PRECIOS (calculadas del scrape — usá estos valores exactos, NO los recalcules):
- Precio mínimo: ${precioStats.precio_minimo} ${currencyCode}
- Precio máximo: ${precioStats.precio_maximo} ${currencyCode}
- Precio promedio (recortado, sin outliers): ${precioStats.precio_promedio} ${currencyCode}
- Precio mediano: ${precioStats.precio_mediano} ${currencyCode}
- Percentiles: p10 ${precioStats.p10} · p25 ${precioStats.p25} · p50 ${precioStats.p50} · p65 ${precioStats.p65} · p90 ${precioStats.p90} ${currencyCode}
- Listings con precio válido: ${precioStats.total_con_precio}
- Listings descartados por estar fuera de rango: ${precioStats.total_descartados}
- Listings con ventas registradas (soldQuantity > 0): ${precioStats.total_con_ventas}
` : '';

  const bloqueConfianza = confianza && confianza.nivel !== "alta" ? `
CONFIANZA DE LOS DATOS: ${confianza.nivel.toUpperCase()}
Motivos detectados: ${confianza.motivos.join(", ")}
Dispersión p90/p10 (sobre el set ya recortado): ${confianza.ratio_p90_p10}×

REGLAS OBLIGATORIAS CON CONFIANZA ${confianza.nivel.toUpperCase()}:
- Usá el precio MEDIANO como referencia de mercado, nunca el promedio.
- El campo "resumen" TIENE QUE arrancar diciendo que los datos son poco confiables y por qué, ANTES de cualquier conclusión sobre el producto.
${confianza.motivos.includes("dispersion_precios") ? `- La búsqueda "${producto}" probablemente mezcló categorías (accesorios, repuestos o lotes junto al producto). Sugerí en la recomendación un término de búsqueda más específico, entre comillas, como PRIMER bullet.` : ''}
- No afirmes márgenes ni ROI como si fueran precisos. Usá rangos y lenguaje condicional.
` : '';

  // EL BLOQUE QUE INVIERTE LA RELACION CON EL MODELO (TAB 3, 20/9).
  // Antes: el prompt describia reglas en prosa y le pedia a Gemini que
  // derivara el numero. Medido el 13/9: 45 puntos de variacion con el input
  // identico. Ahora el numero ya viene calculado por lib/score.ts y el modelo
  // recibe el desglose para EXPLICARLO. No tiene que producir ningun numero.
  const bloqueVeredicto = `
VEREDICTO YA CALCULADO — NO LO RECALCULES, NO LO DISCUTAS, NO LO CONTRADIGAS

Score: ${score.score}/100 → ${score.veredicto}
Precio de entrada para un vendedor ${perfil}: ${score.precio_sugerido} ${currencyCode}
Comisión de Mercado Libre (${score.comision.tipo_publicacion}, ${score.comision.categoria}): ${score.comision.porcentaje}% + ${score.comision.cargo_fijo} fijo = ${score.comision.monto_total} ${currencyCode}
Margen neto a ese precio: ${score.margen_neto_pct}%

Cómo se compone el score (${score.puntos_obtenidos} de ${score.puntos_posibles} puntos posibles):
${explicarScore(score)}

Este score sale de una fórmula determinista sobre los datos del scrape. Tu trabajo es
explicarlo en palabras, no producirlo. Reglas duras:
- Todo lo que escribas tiene que ser coherente con el veredicto ${score.veredicto}. Si el
  score es bajo, no cierres el resumen en tono optimista, y al revés.
- Usá los componentes de arriba como el esqueleto del resumen: el lector tiene que
  entender POR QUÉ ese número, con los datos concretos.
- No inventes otro score, otro margen ni otro precio sugerido en ningún campo de texto.
`;

  return `Eres un analista experto de Mercado Libre.${imagenBase64 ? " Evaluá también la imagen adjunta: calidad visual, diferenciación y posicionamiento." : ""}

Producto: "${producto}" | País: ${pais} (${scrape.domain}) | Costo/unidad: ${costoLocal} ${currencyCode} | Publicaciones: ${scrape.totalListings}

Todos los precios de este análisis están en ${currencyCode}. No conviertas a ninguna otra moneda.
Cuando menciones el costo, usá siempre ${costoLocal} ${currencyCode}.

${mlData?.trends?.interest ? `TENDENCIA EN GOOGLE (último año en ${pais}):
Interés promedio: ${mlData.trends.interest}/100
En tendencia creciente: ${mlData.trends.trending ? "SÍ" : "NO"}
${mlData.trends.related?.length ? `- Búsquedas relacionadas: ${mlData.trends.related.join(', ')}` : ''}

Usá estos datos SOLO para la sección de tendencia. No entran en el veredicto.

` : ''}${bloqueVeredicto}
${preciosCalculados}${bloqueConfianza}
PERFIL DEL VENDEDOR: ${perfil}
- principiante: publicación Clásica, entra por el percentil 10. La recomendación tiene que incluir cómo construir reputación desde cero (primeras ventas, precio de lanzamiento, envío gratis inicial).
- intermedio: publicación Premium, entra por el percentil 25. Recomendación enfocada en diferenciación.
- experto: publicación Premium, entra por el percentil 65. Recomendación enfocada en escala y volumen.

Datos del scrape (${sample.length} publicaciones de ML):
Cada item tiene: title, price (en ${currencyCode}), soldQuantity (unidades vendidas — null si no hay datos), seller, rating, reviewsCount, isFreeShipping, url.
${JSON.stringify(sample)}

${score.score <= 74 ? `PRODUCTOS ALTERNATIVOS (obligatorio: el score es ${score.score}):
Sugerí 2-3 productos alternativos relacionados que podrían tener mejor oportunidad en el mismo mercado.
Para cada uno: nombre específico (no genérico), razón en una frase, y nicho: "específico" | "adyacente" | "segmento".
Ejemplo: "Auriculares TWS genéricos" (saturado) → "Auriculares TWS con cancelación de ruido ANC" (específico), "Auriculares óseos deportivos" (adyacente), "Auriculares TWS para niños con limitador de volumen" (segmento).` : `PRODUCTOS ALTERNATIVOS: devolvé "productos_alternativos": [] — el score es ${score.score} y el producto se sostiene solo.`}

Respondé SOLO con JSON válido (sin markdown). No incluyas score, veredicto, margen ni comisión: esos ya están calculados.
{"resumen":"Arranca DIRECTO con la conclusión principal (ej: 'El costo es competitivo pero la competencia es alta'). Sin introducción ni contexto genérico. Máximo 3-4 líneas. Tiene que ser coherente con el veredicto ${score.veredicto} y apoyarse en el componente que más pesó.","competencia":{"top_vendedores":[{"nombre":"","precio":${currencyCode},"ventas":int,"reputacion":"ALTA|MEDIA|BAJA","diferenciador":""}],"palabras_clave_titulos":["","","","",""],"distribucion_precios":[{"rango":"","cantidad":int}]},"tendencia":"","diferenciadores_oportunidad":["","",""],"riesgos":["","",""],"recomendacion":"Exactamente 3 bullets separados por ' | '. Cada bullet: acción concreta + por qué. Ordenados de mayor a menor impacto. Ejemplo: 'Entrá al percentil 10 de precios para las primeras 10 ventas — la reputación inicial es más valiosa que el margen | Ofrecé envío gratis los primeros 30 días — mejora conversión 30-40% | Armá combo funda + vidrio templado — diferenciás sin bajar precio'","titulo_sugerido_publicacion":"≤60 chars","productos_alternativos":[{"nombre":"","razon":"","nicho":"específico"|"adyacente"|"segmento"}]}

REGLA DE TENDENCIA:
- Si no hay datos de ventas en el scraping, inferí la tendencia basándote en: a) la categoría del producto b) el país c) el contexto general del e-commerce latinoamericano
- NUNCA devuelvas "No hay datos suficientes" — siempre inferí algo útil
- NO inventes estacionalidad ni rangos de precio mayorista: no hay ninguna serie temporal ni ninguna fuente de precios de proveedor conectada al sistema, y esos dos bloques se sacaron del producto el 21/9 por eso mismo (TAB 4)

Reglas generales:
- top_vendedores: los 3 mejores por ventas; distribucion_precios: al menos 2 rangos
- Todos los precios que escribas van en ${currencyCode}${datosPro ? `

DATOS ADICIONALES DEL VENDEDOR (usar para personalizar el análisis):
- Origen del producto: ${datosPro.origen_producto || 'no especificado'}
- Presupuesto inicial disponible: ${datosPro.presupuesto_inicial ? `${datosPro.presupuesto_inicial} ${currencyCode}` : 'no especificado'}
- Producto con variantes: ${datosPro.tiene_variantes || 'no especificado'}${datosPro.detalle_variantes ? ` (${datosPro.detalle_variantes})` : ''}
- Canal de distribución: ${datosPro.canal_distribucion || 'no especificado'}

Con estos datos, ADEMÁS de personalizar el resto del análisis, agregá al JSON un campo "analisis_avanzado" con esta forma exacta:

"analisis_avanzado":{"primera_compra":{"unidades":int,"inversion_usd":número,"costo_unitario_usd":número,"detalle":"1-2 frases: qué alcanza a comprar con su presupuesto y si es una cantidad sensata para arrancar"},"importacion":{"costos_extra":"flete + aduana + impuestos estimados como % sobre el FOB, para el origen que indicó","tiempo_estimado":"ej: 30-45 días puerta a puerta","detalle":"1-2 frases sobre riesgos o requisitos de ese origen"},"mix_variantes":[{"variante":"","proporcion":"ej: 50%","razon":"por qué esa proporción según lo scrapeado"}],"plan_canal":{"titulo":"","detalle":"2-3 frases de plan de lanzamiento concreto para el canal que indicó"}}

Reglas de "analisis_avanzado":
- unidades = presupuesto_inicial dividido el costo unitario estimado. Hacé la cuenta, no la dejes implícita.
- Si NO indicó presupuesto, omití "primera_compra". Si NO indicó origen, omití "importacion". Si dijo que no tiene variantes o no lo indicó, omití "mix_variantes". Si no indicó canal, omití "plan_canal". No inventes datos que el usuario no dio.
- "mix_variantes": máximo 4 entradas, y las proporciones tienen que sumar 100%.
- Este bloque es lo que el usuario está pagando: tiene que ser específico y accionable, no genérico. Nada de "dependerá de tu estrategia".` : ''}`;
}

function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAnalysis(raw: unknown, args: AnalyzeArgs): AnalysisResult {
  const r = (raw ?? {}) as Partial<AnalysisResult> & Record<string, unknown>;

  // El score y el veredicto ya NO se leen de la respuesta del modelo. Salen de
  // lib/score.ts, que tambien aplica el techo por confianza. Si el modelo
  // devuelve un "score" igual —el prompt le pide que no lo haga— se ignora en
  // silencio: no hay camino por el que un numero del LLM llegue a la base.
  const score = args.score.score;
  const veredicto: AnalysisResult["veredicto"] = args.score.veredicto;

  const competencia = (r.competencia ?? {}) as Partial<AnalysisResult["competencia"]> & Record<string, unknown>;

  const topVendedores = Array.isArray(competencia.top_vendedores)
    ? competencia.top_vendedores.slice(0, 5).map((v) => {
        const vv = (v ?? {}) as unknown as Record<string, unknown>;
        return {
          nombre: typeof vv.nombre === "string" ? vv.nombre : "Desconocido",
          precio: toNumber(vv.precio, 0),
          ventas: clampInt(vv.ventas, 0, 9999999, 0),
          reputacion: typeof vv.reputacion === "string" ? vv.reputacion : "MEDIA",
          diferenciador: typeof vv.diferenciador === "string" ? vv.diferenciador : "",
        };
      })
    : [];

  const distribucionPrecios = Array.isArray(competencia.distribucion_precios)
    ? competencia.distribucion_precios.slice(0, 8).map((d) => {
        const dd = (d ?? {}) as unknown as Record<string, unknown>;
        return {
          rango: typeof dd.rango === "string" ? dd.rango : "?",
          cantidad: clampInt(dd.cantidad, 0, 99999, 0),
        };
      })
    : [];

  // "analisis_avanzado" solo existe si el usuario mando datos_pro. Cada sub
  // bloque se valida por separado porque el prompt le pide al modelo que omita
  // los que el usuario no contesto — un Pro puede llenar dos campos y no los
  // otros dos, y la UI tiene que poder mostrar solo lo que se pidio.
  const avanzadoRaw = (r.analisis_avanzado ?? null) as Record<string, unknown> | null;
  let avanzado: AnalysisResult["analisis_avanzado"] = null;
  if (args.datosPro && avanzadoRaw && typeof avanzadoRaw === "object") {
    const pc = (avanzadoRaw.primera_compra ?? null) as Record<string, unknown> | null;
    const imp = (avanzadoRaw.importacion ?? null) as Record<string, unknown> | null;
    const canal = (avanzadoRaw.plan_canal ?? null) as Record<string, unknown> | null;
    const mix = Array.isArray(avanzadoRaw.mix_variantes)
      ? (avanzadoRaw.mix_variantes as unknown[]).slice(0, 4).map((v) => {
          const vv = (v ?? {}) as Record<string, unknown>;
          return {
            variante: typeof vv.variante === "string" ? vv.variante : "",
            proporcion: typeof vv.proporcion === "string" ? vv.proporcion : "",
            razon: typeof vv.razon === "string" ? vv.razon : "",
          };
        }).filter((v) => v.variante)
      : [];

    const bloque = {
      primera_compra:
        pc && toNumber(pc.unidades, 0) > 0
          ? {
              unidades: clampInt(pc.unidades, 0, 9999999, 0),
              inversion_usd: toNumber(pc.inversion_usd, 0),
              costo_unitario_usd: toNumber(pc.costo_unitario_usd, 0),
              detalle: typeof pc.detalle === "string" ? pc.detalle : "",
            }
          : null,
      importacion:
        imp && typeof imp.costos_extra === "string"
          ? {
              costos_extra: imp.costos_extra,
              tiempo_estimado: typeof imp.tiempo_estimado === "string" ? imp.tiempo_estimado : "",
              detalle: typeof imp.detalle === "string" ? imp.detalle : "",
            }
          : null,
      mix_variantes: mix.length > 0 ? mix : null,
      plan_canal:
        canal && typeof canal.detalle === "string" && canal.detalle
          ? {
              titulo: typeof canal.titulo === "string" ? canal.titulo : "Plan de lanzamiento",
              detalle: canal.detalle,
            }
          : null,
    };

    // Si el modelo devolvio el objeto pero todo vacio, no lo guardamos: la UI
    // mostraria una seccion "Analisis avanzado Pro" en blanco, que es peor que
    // no mostrarla.
    const tieneAlgo =
      bloque.primera_compra || bloque.importacion || bloque.mix_variantes || bloque.plan_canal;
    avanzado = tieneAlgo ? bloque : null;
  }

  // costo_evaluacion tambien deja de ser opinion del modelo. Se deriva del
  // margen neto ya calculado, que es la unica lectura honesta de "tu costo es
  // alto": alto respecto de que se puede cobrar en este mercado.
  const m = args.score.margen_neto_pct;
  const costoEval: AnalysisResult["margen"]["costo_evaluacion"] =
    m >= 20 ? "COMPETITIVO" : m >= 5 ? "ALTO" : "MUY_ALTO";

  return {
    veredicto,
    score,
    resumen: typeof r.resumen === "string" ? r.resumen : "Análisis no disponible.",
    competencia: {
      // Vendedores UNICOS contados en codigo. En los 36 historicos el modelo
      // devolvia la cantidad de publicaciones (30/30, 52/52, 60/60): nunca
      // conto vendedores. Ahora sale de lib/score.ts.
      cantidad_vendedores: args.score.metricas.vendedores_unicos,
      // Si tenemos las estadisticas calculadas, mandan ellas. El prompt ya dice
      // "usá estos valores exactos, NO los recalcules", pero cuando el modelo
      // igual los recalcula la UI terminaba mostrando un promedio distinto del
      // que uso el razonamiento. Aca dejan de poder divergir.
      precio_minimo: args.precioStats?.precio_minimo ?? toNumber(competencia.precio_minimo, 0),
      precio_maximo: args.precioStats?.precio_maximo ?? toNumber(competencia.precio_maximo, 0),
      precio_promedio: args.precioStats?.precio_promedio ?? toNumber(competencia.precio_promedio, 0),
      top_vendedores: topVendedores,
      palabras_clave_titulos: Array.isArray(competencia.palabras_clave_titulos)
        ? (competencia.palabras_clave_titulos as unknown[]).map(String).slice(0, 10)
        : [],
      distribucion_precios: distribucionPrecios,
    },
    // Todo el bloque de margen sale de la aritmetica de lib/score.ts +
    // lib/comisiones.ts. Ya no se le pide al modelo: era la mitad del ruido y
    // ademas el origen de los margenes de -1358% que hay en la base.
    margen: {
      precio_sugerido_venta: args.score.precio_sugerido,
      comision_ml_estimada: args.score.comision.monto_total,
      ganancia_estimada: Math.round(
        args.score.precio_sugerido -
          args.score.comision.monto_total -
          args.costoEstimadoUsd * (args.exchangeRate ?? 1)
      ),
      margen_porcentaje: args.score.margen_neto_pct,
      costo_evaluacion: costoEval,
    },
    tendencia: typeof r.tendencia === "string" ? r.tendencia : "No pudimos estimar la tendencia para este producto en este momento. El resto del análisis no se ve afectado.",
    diferenciadores_oportunidad: Array.isArray(r.diferenciadores_oportunidad)
      ? (r.diferenciadores_oportunidad as unknown[]).map(String).slice(0, 5)
      : [],
    riesgos: Array.isArray(r.riesgos)
      ? (r.riesgos as unknown[]).map((x) => String(x)).slice(0, 5)
      : [],
    recomendacion: typeof r.recomendacion === "string" ? r.recomendacion : "No pudimos generar una recomendación específica para este producto. Revisá el resumen y los datos de competencia para decidir.",
    titulo_sugerido_publicacion: typeof r.titulo_sugerido_publicacion === "string"
      ? r.titulo_sugerido_publicacion
      : "",
    moneda: args.currency?.code ?? "ARS",
    tasa_cambio: args.exchangeRate ?? 1400,
    productos_alternativos: Array.isArray(r.productos_alternativos)
      ? (r.productos_alternativos as unknown[]).slice(0, 3).map((a) => {
          const aa = (a ?? {}) as Record<string, unknown>;
          const nichoRaw = String(aa.nicho ?? "").toLowerCase();
          const nicho: "específico" | "adyacente" | "segmento" =
            nichoRaw === "adyacente" ? "adyacente"
            : nichoRaw === "segmento" ? "segmento"
            : "específico";
          return {
            nombre: typeof aa.nombre === "string" ? aa.nombre : "",
            razon: typeof aa.razon === "string" ? aa.razon : "",
            nicho,
          };
        }).filter((a) => a.nombre)
      : [],
    comision_detalle: {
      tipo_publicacion: args.score.comision.tipo_publicacion,
      porcentaje: args.score.comision.porcentaje,
      monto_ars: args.score.comision.monto_total,
      // monto_usd se conserva por compatibilidad con la UI: desde la migracion
      // a ARS-only (13/9) la tasa es 1, asi que es el mismo numero.
      monto_usd: args.score.comision.monto_total,
      cargo_fijo_ars: args.score.comision.cargo_fijo,
    },
    ...(avanzado ? { analisis_avanzado: avanzado } : {}),
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toNumber(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
