import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScrapeResult } from "./apify";
import type { AnalysisResult } from "./supabase";

const MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;

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
  mlTrends?: string[];
  mlSearchData?: { total: number; categoryData: { categoryName: string; totalInCategory: number } | null };
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
        { model: modelName, generationConfig: { temperature: 0.4 } },
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

function buildPrompt({ producto, pais, costoEstimadoUsd, scrape, imagenBase64, currency, exchangeRate, perfilVendedor, mlTrends, mlSearchData }: AnalyzeArgs) {
  const sample = scrape.listings.slice(0, 50);
  const currencyCode = currency?.code ?? "ARS";
  const currencyName = currency?.name ?? "Peso argentino";
  const rate = exchangeRate ?? 1400;
  const perfil = perfilVendedor ?? "principiante";
  return `Eres un analista experto de Mercado Libre.${imagenBase64 ? " Evaluá también la imagen adjunta: calidad visual, diferenciación y posicionamiento." : ""}

Producto: "${producto}" | País: ${pais} (${scrape.domain}) | Costo/unidad USD: ${costoEstimadoUsd} | Publicaciones: ${scrape.totalListings}

${mlTrends && mlTrends.length > 0 ? `TENDENCIAS REALES DE MERCADO LIBRE HOY (${new Date().toLocaleDateString('es-AR')}):
${mlTrends.join(', ')}
Si el producto analizado ("${producto}") coincide o está relacionado con alguna de estas tendencias, mencionarlo explícitamente en la sección "tendencia" del análisis.
Si no aparece en tendencias, indicarlo como dato relevante.

` : ''}${mlSearchData?.total ? `DATOS REALES DE MERCADO LIBRE:
Total de publicaciones para "${producto}" en ${pais}: ${mlSearchData.total.toLocaleString('es-AR')} publicaciones
${mlSearchData.categoryData ? `- Categoría principal: ${mlSearchData.categoryData.categoryName} (${mlSearchData.categoryData.totalInCategory.toLocaleString('es-AR')} publicaciones en esa categoría)` : ''}
Nota: el scraping analizó una muestra de ${scrape.totalListings} publicaciones de ese universo total

Usá el total real de publicaciones para evaluar la saturación del mercado:
- Menos de 500 publicaciones: mercado poco competido
- 500-2000 publicaciones: competencia moderada
- Más de 2000 publicaciones: mercado muy competido/saturado

` : ''}MONEDA LOCAL: ${currencyName} (${currencyCode})
TASA DE CAMBIO HOY: 1 USD = ${rate} ${currencyCode}
REGLA DE PRECIOS CRÍTICA:
- Todos los precios del scraping ya están en ${currencyCode} (moneda local)
- Reportá precio_promedio, precio_minimo, precio_maximo y precio_sugerido en ${currencyCode} (moneda local) — NO convertir a USD
- SOLO el costo_estimado y la ganancia_estimada van en USD (porque el usuario los ingresó en USD)
- Para calcular margen: convertí el precio_sugerido de ${currencyCode} a USD usando la tasa (dividir por ${rate}), luego restá el costo en USD
- Ejemplo: si precio_sugerido = ${Math.round(rate * 25)} ${currencyCode} y costo = 10 USD → precio en USD = 25 → ganancia = 25 - 10 - comision = X USD

PERFIL DEL VENDEDOR: ${perfil}
Reglas según perfil:
- Si es "principiante": Penalizar fuerte mercados con más de 15 vendedores activos. El precio de entrada recomendado debe ser el percentil 10 del mercado (los más baratos con ventas), no el promedio. El score debe bajar 20-30 puntos si hay muchos competidores establecidos. La recomendación debe incluir consejos específicos para construir reputación desde cero (primeras ventas, precios de lanzamiento, envío gratis inicial).
- Si es "intermedio": Usar precio del percentil 25-30. Score normal según competencia. Recomendación enfocada en diferenciación y optimización.
- Si es "experto": Usar precio del percentil 40-50 (puede entrar al promedio). Score puede ser más alto en mercados competidos. Recomendación enfocada en escala y volumen.

REGLA DURA DE PRECIO SUGERIDO:
- Para "principiante": el precio_sugerido NUNCA puede ser mayor al precio_minimo del mercado. Debe estar entre precio_minimo y precio_minimo * 1.05 (hasta 5% sobre el mínimo). Objetivo: conseguir las primeras ventas y reputación, no maximizar margen.
- Para "intermedio": precio_sugerido entre percentil 20 y percentil 35 del mercado.
- Para "experto": precio_sugerido en el percentil 30-50 del mercado.

Datos (${sample.length} items):
${JSON.stringify(sample)}

Respondé SOLO con JSON válido (sin markdown):
{"veredicto":"VIABLE"|"SATURADO"|"MARGINAL","score":0-100,"resumen":"4-5 líneas de análisis real","competencia":{"cantidad_vendedores":int,"precio_minimo":${currencyCode},"precio_maximo":${currencyCode},"precio_promedio":${currencyCode},"top_vendedores":[{"nombre":"","precio":${currencyCode},"ventas":int,"reputacion":"ALTA|MEDIA|BAJA","diferenciador":""}],"palabras_clave_titulos":["","","","",""],"distribucion_precios":[{"rango":"","cantidad":int}]},"margen":{"precio_sugerido_venta":${currencyCode},"comision_ml_estimada":USD,"ganancia_estimada":USD,"margen_porcentaje":número,"costo_evaluacion":"COMPETITIVO"|"ALTO"|"MUY_ALTO"},"tendencia":"","estacionalidad":"","diferenciadores_oportunidad":["","",""],"riesgos":["","",""],"recomendacion":"","titulo_sugerido_publicacion":"≤60 chars","analisis_costo_proveedor":{"rango_mayorista_estimado":"USD/unidad","evaluacion":""}}

REGLA DE TENDENCIA Y ESTACIONALIDAD:
- Si no hay datos de ventas en el scraping, inferí la tendencia basándote en: a) La categoría del producto (electrónica, hogar, moda, etc.) b) El país (Argentina, México, Colombia) c) El contexto general del mercado de e-commerce latinoamericano
- NUNCA devuelvas "No hay datos suficientes" — siempre inferí algo útil
- Ejemplos válidos: "Crecimiento sostenido en electrónica de consumo en Argentina 2024-2026", "Demanda estable con picos en Hot Sale y Navidad", "Categoría en expansión post-pandemia en LATAM"
- Para estacionalidad, si es electrónica: mencionar Hot Sale (mayo), CyberMonday (noviembre), Navidad
- Si es hogar/electrodomésticos: mencionar inicio de año (enero-febrero) y Hot Sale
- Si es moda: temporadas + Hot Sale

REGLAS DE SCORE:
- Si no hay datos de ventas registradas en las publicaciones: máximo score 65
- Si hay más de 30 vendedores activos Y el perfil es principiante: máximo score 50
- Si hay más de 30 vendedores activos Y el perfil es intermedio: máximo score 65
- Si hay más de 30 vendedores activos Y el perfil es experto: máximo score 80
- Un score de 75+ requiere que haya evidencia de ventas reales en el mercado

Reglas generales:
- VIABLE score 75-100 (>25% margen, poca competencia) | MARGINAL 50-74 (10-25% margen) | SATURADO 0-49 (<10% margen)
- costo_evaluacion: COMPETITIVO=similar/menor a importación directa; ALTO=20-50% mayor; MUY_ALTO=>50% mayor
- top_vendedores: los 3 mejores por ventas; distribucion_precios: al menos 2 rangos
- precio_sugerido: según perfil vendedor y REGLA DURA arriba, en ${currencyCode}; comision_ml_estimada y ganancia_estimada en USD
- Precios de mercado en ${currencyCode}; comision y ganancia en USD.`;
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
  const score = clampInt(r.score, 0, 100, 50);
  const veredicto: AnalysisResult["veredicto"] =
    score >= 75 ? "VIABLE" : score >= 50 ? "MARGINAL" : "SATURADO";

  const competencia = (r.competencia ?? {}) as Partial<AnalysisResult["competencia"]> & Record<string, unknown>;
  const margen = (r.margen ?? {}) as Partial<AnalysisResult["margen"]> & Record<string, unknown>;
  const analisisCosto = (r.analisis_costo_proveedor ?? {}) as Record<string, unknown>;

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

  const costoEvalRaw = String(margen.costo_evaluacion ?? "COMPETITIVO").toUpperCase();
  const costoEval =
    costoEvalRaw === "ALTO" || costoEvalRaw === "MUY_ALTO"
      ? (costoEvalRaw as "ALTO" | "MUY_ALTO")
      : "COMPETITIVO";

  return {
    veredicto,
    score,
    resumen: typeof r.resumen === "string" ? r.resumen : "Análisis no disponible.",
    competencia: {
      cantidad_vendedores: clampInt(competencia.cantidad_vendedores, 0, 99999, args.scrape.totalListings),
      precio_minimo: toNumber(competencia.precio_minimo, 0),
      precio_maximo: toNumber(competencia.precio_maximo, 0),
      precio_promedio: toNumber(competencia.precio_promedio, 0),
      top_vendedores: topVendedores,
      palabras_clave_titulos: Array.isArray(competencia.palabras_clave_titulos)
        ? (competencia.palabras_clave_titulos as unknown[]).map(String).slice(0, 10)
        : [],
      distribucion_precios: distribucionPrecios,
    },
    margen: {
      precio_sugerido_venta: toNumber(margen.precio_sugerido_venta, 0),
      comision_ml_estimada: toNumber(margen.comision_ml_estimada, 0),
      ganancia_estimada: toNumber(margen.ganancia_estimada, 0),
      margen_porcentaje: toNumber(margen.margen_porcentaje, 0),
      costo_evaluacion: costoEval,
    },
    tendencia: typeof r.tendencia === "string" ? r.tendencia : "Sin datos de tendencia.",
    estacionalidad: typeof r.estacionalidad === "string" ? r.estacionalidad : "Sin datos de estacionalidad.",
    diferenciadores_oportunidad: Array.isArray(r.diferenciadores_oportunidad)
      ? (r.diferenciadores_oportunidad as unknown[]).map(String).slice(0, 5)
      : [],
    riesgos: Array.isArray(r.riesgos)
      ? (r.riesgos as unknown[]).map((x) => String(x)).slice(0, 5)
      : [],
    recomendacion: typeof r.recomendacion === "string" ? r.recomendacion : "Revisar manualmente.",
    titulo_sugerido_publicacion: typeof r.titulo_sugerido_publicacion === "string"
      ? r.titulo_sugerido_publicacion
      : "",
    analisis_costo_proveedor: {
      rango_mayorista_estimado: typeof analisisCosto.rango_mayorista_estimado === "string"
        ? analisisCosto.rango_mayorista_estimado
        : "No disponible",
      evaluacion: typeof analisisCosto.evaluacion === "string"
        ? analisisCosto.evaluacion
        : "No disponible",
    },
    moneda: args.currency?.code ?? "ARS",
    tasa_cambio: args.exchangeRate ?? 1400,
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
