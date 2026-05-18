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
  return `Eres un analista experto de Mercado Libre en LATAM. Te paso datos reales de scraping y un costo estimado por unidad.${imagenBase64 ? " También te adjunto una imagen del producto para que evalúes su calidad, diferenciación visual y posicionamiento." : ""}

Producto: "${producto}"
País objetivo: ${pais} (dominio: ${scrape.domain})
Costo estimado por unidad (USD): ${costoEstimadoUsd}
Cantidad de publicaciones relevadas: ${scrape.totalListings}

Listado (JSON, hasta 50 items):
${JSON.stringify(sample, null, 2)}

Devolvé EXCLUSIVAMENTE un JSON válido (sin texto adicional, sin markdown) con esta estructura exacta:
{
  "veredicto": "VIABLE" | "SATURADO" | "MARGINAL",
  "score": número entero entre 0 y 100,
  "resumen": "4-5 líneas con análisis real del mercado y oportunidad",
  "competencia": {
    "cantidad_vendedores": entero,
    "precio_minimo": número en USD,
    "precio_maximo": número en USD,
    "precio_promedio": número en USD,
    "top_vendedores": [
      {
        "nombre": "nombre del vendedor",
        "precio": número en USD,
        "ventas": entero (cantidad vendida),
        "reputacion": "ALTA|MEDIA|BAJA",
        "diferenciador": "qué los hace destacar en 1 línea"
      }
    ],
    "palabras_clave_titulos": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "distribucion_precios": [
      { "rango": "0-20", "cantidad": entero },
      { "rango": "20-50", "cantidad": entero },
      { "rango": "50-100", "cantidad": entero },
      { "rango": "100+", "cantidad": entero }
    ]
  },
  "margen": {
    "precio_sugerido_venta": número en USD (calculado según la lógica de percentil 30 indicada al final),
    "comision_ml_estimada": número en USD (comisión total estimada de Mercado Libre por venta),
    "ganancia_estimada": número en USD (precio_sugerido - costo - comision),
    "margen_porcentaje": número (ganancia/precio_sugerido * 100),
    "costo_evaluacion": "COMPETITIVO" | "ALTO" | "MUY_ALTO"
  },
  "tendencia": "descripción de la tendencia y demanda observada en los datos",
  "estacionalidad": "descripción de estacionalidad y épocas de mayor demanda para este producto",
  "diferenciadores_oportunidad": ["oportunidad1", "oportunidad2", "oportunidad3"],
  "riesgos": ["riesgo1", "riesgo2", "riesgo3"],
  "recomendacion": "una recomendación accionable y específica para el seller",
  "titulo_sugerido_publicacion": "un título optimizado para ML con palabras clave relevantes (máx 60 caracteres)",
  "analisis_costo_proveedor": {
    "rango_mayorista_estimado": "rango estimado en USD basado en Alibaba/importación (ej: $8-15 USD/unidad)",
    "evaluacion": "análisis de si el costo ingresado es competitivo vs importación directa"
  }
}

Criterio de veredicto (usá el score para determinar el veredicto de forma consistente):
- VIABLE: score 75-100. Poca competencia o márgenes claros (>25%).
- MARGINAL: score 50-74. Viable pero ajustado (10-25% margen) o competencia media.
- SATURADO: score 0-49. Mucha competencia con precios bajos y margen <10%.

Criterio de costo_evaluacion:
- COMPETITIVO: el costo ingresado es similar o menor al rango de importación directa.
- ALTO: el costo es 20-50% mayor al promedio de importación directa.
- MUY_ALTO: el costo es más del 50% mayor al promedio de importación directa.

Para top_vendedores incluí los 3 mejores vendedores por ventas/precio. Incluí al menos 2 items en distribucion_precios.

Para calcular precio_sugerido_venta seguí esta lógica en orden:
1. Tomá los precios scrapeados y ordenalos de menor a mayor
2. Identificá el percentil 30 (precio que está por encima del 30% más barato del mercado) — esta es la zona de mayor conversión en ML sin competir con réplicas
3. Verificá que ese precio cubra: costo del usuario + 15% de comisión ML estimada + 25% de margen mínimo
4. Si no cubre, subí al precio mínimo que sí cubra esos costos
5. El precio sugerido final es ese número, redondeado al entero más cercano
6. En la recomendación, explicá brevemente por qué ese precio es el óptimo: qué posición ocupa en el mercado y qué margen real deja después de comisiones ML

Usá precios en USD para todos los cálculos, sin asumir tipo de cambio específico. No incluyas comentarios ni texto fuera del JSON.`;
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
