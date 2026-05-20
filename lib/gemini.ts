import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScrapeResult } from "./apify";
import type { AnalysisResult } from "./supabase";

const GEMINI_MODEL = "gemini-2.5-flash";

interface AnalyzeArgs {
  producto: string;
  pais: "AR" | "MX" | "CO";
  costoEstimadoUsd: number;
  scrape: ScrapeResult;
  imagenBase64?: string;
  imagenMimeType?: string;
}

export async function analizarConGemini(
  args: AnalyzeArgs
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  console.log("[gemini] calling model", GEMINI_MODEL);

  const genAI = new GoogleGenerativeAI(apiKey);
  // responseMimeType only exists in v1beta; v1 enforces JSON via the prompt
  const model = genAI.getGenerativeModel(
    { model: GEMINI_MODEL, generationConfig: { temperature: 0.4 } },
    { apiVersion: "v1" }
  );

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

  const result = await model.generateContent(parts);
  const text = result.response.text();
  console.log("[gemini] raw response length", text?.length ?? 0);

  if (!text) throw new Error("Gemini devolvió respuesta vacía");

  const parsed = extractJson(text);
  if (!parsed) throw new Error(`Gemini no devolvió JSON válido. Respuesta: ${text.slice(0, 200)}`);

  return normalizeAnalysis(parsed, args);
}

function buildPrompt({ producto, pais, costoEstimadoUsd, scrape, imagenBase64 }: AnalyzeArgs) {
  const sample = scrape.listings.slice(0, 50);
  return `Eres un analista experto de Mercado Libre.${imagenBase64 ? " Evaluá también la imagen adjunta: calidad visual, diferenciación y posicionamiento." : ""}

Producto: "${producto}" | País: ${pais} (${scrape.domain}) | Costo/unidad USD: ${costoEstimadoUsd} | Publicaciones: ${scrape.totalListings}

Datos (${sample.length} items):
${JSON.stringify(sample)}

Respondé SOLO con JSON válido (sin markdown):
{"veredicto":"VIABLE"|"SATURADO"|"MARGINAL","score":0-100,"resumen":"4-5 líneas de análisis real","competencia":{"cantidad_vendedores":int,"precio_minimo":USD,"precio_maximo":USD,"precio_promedio":USD,"top_vendedores":[{"nombre":"","precio":USD,"ventas":int,"reputacion":"ALTA|MEDIA|BAJA","diferenciador":""}],"palabras_clave_titulos":["","","","",""],"distribucion_precios":[{"rango":"","cantidad":int}]},"margen":{"precio_sugerido_venta":USD,"comision_ml_estimada":USD,"ganancia_estimada":USD,"margen_porcentaje":número,"costo_evaluacion":"COMPETITIVO"|"ALTO"|"MUY_ALTO"},"tendencia":"","estacionalidad":"","diferenciadores_oportunidad":["","",""],"riesgos":["","",""],"recomendacion":"","titulo_sugerido_publicacion":"≤60 chars","analisis_costo_proveedor":{"rango_mayorista_estimado":"USD/unidad","evaluacion":""}}

Reglas:
- VIABLE score 75-100 (>25% margen, poca competencia) | MARGINAL 50-74 (10-25% margen) | SATURADO 0-49 (<10% margen)
- costo_evaluacion: COMPETITIVO=similar/menor a importación directa; ALTO=20-50% mayor; MUY_ALTO=>50% mayor
- top_vendedores: los 3 mejores por ventas; distribucion_precios: al menos 2 rangos
- precio_sugerido: percentil 30 del mercado, verificando costo + 15% comisión ML + 25% margen mínimo; si no cubre, subí al mínimo que cubra
- Todos los precios en USD.`;
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
