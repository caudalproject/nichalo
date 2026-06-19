import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScrapeResult } from "./apify";
import type { AnalysisResult } from "./supabase";

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
  mlTrends?: string[];
  mlData?: {
    total: number;
    trends?: { trending: boolean; interest: number; related: string[] };
  };
  datosPro?: DatosPro;
  precioStats?: {
    precio_minimo: number;
    precio_maximo: number;
    precio_promedio: number;
    p10: number;
    p25: number;
    p50: number;
    p65: number;
    total_con_precio: number;
    total_con_ventas: number;
  } | null;
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

function buildPrompt({ producto, pais, costoEstimadoUsd, scrape, imagenBase64, currency, exchangeRate, perfilVendedor, mlTrends, mlData, datosPro, precioStats }: AnalyzeArgs) {
  const sample = scrape.listings.slice(0, 50);
  const currencyCode = currency?.code ?? "ARS";
  const currencyName = currency?.name ?? "Peso argentino";
  const FALLBACK_RATES: Record<string, number> = { ARS: 1400, MXN: 17, COP: 4200 };
  const rate = exchangeRate ?? FALLBACK_RATES[currencyCode] ?? 1400;
  const perfil = perfilVendedor ?? "principiante";
  const costoEnMonedaLocal = Math.round(costoEstimadoUsd * rate);
  const preciosCalculados = precioStats ? `
ESTADÍSTICAS DE PRECIOS (calculadas del scrape — usá estos valores exactos, NO los recalcules):
- Precio mínimo: ${precioStats.precio_minimo} ${currencyCode}
- Precio máximo: ${precioStats.precio_maximo} ${currencyCode}
- Precio promedio: ${precioStats.precio_promedio} ${currencyCode}
- Percentil 10 (p10): ${precioStats.p10} ${currencyCode}
- Percentil 25 (p25): ${precioStats.p25} ${currencyCode}
- Percentil 50 (p50): ${precioStats.p50} ${currencyCode}
- Percentil 65 (p65): ${precioStats.p65} ${currencyCode}
- Listings con precio válido: ${precioStats.total_con_precio}
- Listings con ventas registradas (soldQuantity > 0): ${precioStats.total_con_ventas}

REGLA DE PRECIO SUGERIDO (usar los percentiles de arriba):
- principiante → usá p10 como precio_sugerido_venta
- intermedio → usá p25
- experto → usá p65
` : '';
  const comisionesPorPais = {
    AR: {
      nombre: "Argentina",
      clasica: {
        categorias: {
          "Electrónica/tecnología": 12.40,
          "Electrodomésticos": 12.40,
          "Ropa y accesorios": 12.40,
          "Deportes y fitness": 12.40,
          "Hogar y jardín": 12.40,
          "Juguetes": 12.40,
          "Resto": 12.40,
        },
        cargo_fijo: (precio: number) => precio < 33000 ? 2500 : precio < 60000 ? 4000 : 0,
      },
      premium: {
        categorias: {
          "Electrónica/tecnología": 13.90,
          "Electrodomésticos": 12.40,
          "Ropa y accesorios": 16.57,
          "Deportes y fitness": 15.40,
          "Hogar y jardín": 15.40,
          "Juguetes": 15.40,
          "Resto": 15.40,
        },
        cargo_fijo: (precio: number) => precio < 33000 ? 2500 : precio < 60000 ? 4000 : 0,
      },
    },
    MX: {
      nombre: "México",
      clasica: {
        categorias: {
          "Electrónica/tecnología": 10.00,
          "Electrodomésticos": 10.00,
          "Ropa y accesorios": 16.00,
          "Deportes y fitness": 14.00,
          "Hogar y jardín": 15.00,
          "Juguetes": 14.00,
          "Resto": 13.00,
        },
        cargo_fijo: (precio: number) => precio < 99 ? 25 : precio < 199 ? 30 : precio < 299 ? 37 : 0,
      },
      premium: {
        categorias: {
          "Electrónica/tecnología": 13.50,
          "Electrodomésticos": 13.50,
          "Ropa y accesorios": 20.50,
          "Deportes y fitness": 17.00,
          "Hogar y jardín": 18.00,
          "Juguetes": 17.00,
          "Resto": 16.50,
        },
        cargo_fijo: (_precio: number) => 0,
      },
    },
    CO: {
      nombre: "Colombia",
      clasica: {
        categorias: {
          "Electrónica/tecnología": 10.00,
          "Electrodomésticos": 10.00,
          "Ropa y accesorios": 15.00,
          "Deportes y fitness": 13.00,
          "Hogar y jardín": 14.00,
          "Juguetes": 13.00,
          "Resto": 13.00,
        },
        cargo_fijo: (precio: number) => precio < 50000 ? 1500 : 0,
      },
      premium: {
        categorias: {
          "Electrónica/tecnología": 13.00,
          "Electrodomésticos": 13.00,
          "Ropa y accesorios": 18.00,
          "Deportes y fitness": 16.00,
          "Hogar y jardín": 16.00,
          "Juguetes": 16.00,
          "Resto": 15.00,
        },
        cargo_fijo: (_precio: number) => 0,
      },
    },
  };

  const paisComisiones = comisionesPorPais[pais] ?? comisionesPorPais.AR;
  const tipoPublicacion = perfil === "principiante" ? "clasica" : "premium";
  const tablaComisiones = tipoPublicacion === "clasica"
    ? paisComisiones.clasica
    : paisComisiones.premium;
  return `Eres un analista experto de Mercado Libre.${imagenBase64 ? " Evaluá también la imagen adjunta: calidad visual, diferenciación y posicionamiento." : ""}

Producto: "${producto}" | País: ${pais} (${scrape.domain}) | Costo/unidad USD: ${costoEstimadoUsd} | Publicaciones: ${scrape.totalListings}

${mlTrends && mlTrends.length > 0 ? `TENDENCIAS REALES DE MERCADO LIBRE HOY (${new Date().toLocaleDateString('es-AR')}):
${mlTrends.join(', ')}
Si el producto analizado ("${producto}") coincide o está relacionado con alguna de estas tendencias, mencionarlo explícitamente en la sección "tendencia" del análisis.
Si no aparece en tendencias, indicarlo como dato relevante.

` : ''}${mlData?.total ? `
DATOS REALES DE MERCADO LIBRE:

Total de publicaciones para "${producto}": ${mlData.total.toLocaleString('es-AR')} publicaciones
Nota: el análisis se basó en una muestra de ${scrape.totalListings} publicaciones

Saturación según total real:
- Menos de 500: mercado poco competido → score puede ser más alto
- 500 a 2.000: competencia moderada
- Más de 2.000: mercado saturado → penalizar score especialmente para principiantes

` : ''}${mlData?.trends?.interest ? `TENDENCIA EN GOOGLE (último año en ${pais}):
Interés promedio: ${mlData.trends.interest}/100
En tendencia creciente: ${mlData.trends.trending ? "SÍ" : "NO"}
${mlData.trends.related?.length ? `- Búsquedas relacionadas: ${mlData.trends.related.join(', ')}` : ''}

Usá estos datos para la sección de tendencia y demanda del análisis.

` : ''}MONEDA LOCAL: ${currencyName} (${currencyCode})
TASA DE CAMBIO HOY: 1 USD = ${rate} ${currencyCode}
REGLA DE COSTO EN RESUMEN Y RECOMENDACIÓN:
El costo del producto en moneda local es ${costoEnMonedaLocal} ${currencyCode}.
Cuando menciones el costo en el resumen o recomendación, usá SIEMPRE ${costoEnMonedaLocal} ${currencyCode}, NUNCA el valor en USD.
Ejemplo correcto: "tu costo de ${costoEnMonedaLocal} ${currencyCode}"
Ejemplo incorrecto: "tu costo de 55.69 USD"
REGLA DE PRECIOS CRÍTICA:
- Todos los precios del scraping ya están en ${currencyCode} (moneda local)
- Reportá precio_promedio, precio_minimo, precio_maximo y precio_sugerido en ${currencyCode} (moneda local) — NO convertir a USD
- SOLO el costo_estimado y la ganancia_estimada van en USD (porque el usuario los ingresó en USD)
- Para calcular margen: convertí el precio_sugerido de ${currencyCode} a USD usando la tasa (dividir por ${rate}), luego restá el costo en USD
- Ejemplo: si precio_sugerido = ${Math.round(rate * 25)} ${currencyCode} y costo = 10 USD → precio en USD = 25 → ganancia = 25 - 10 - comision = X USD

${preciosCalculados}
PERFIL DEL VENDEDOR: ${perfil}
Reglas según perfil:
- Si es "principiante": Aplicar escala de penalización según REGLAS DE SCORE definidas abajo — 11-20 vendedores: -10 puntos, 21-30: -20 puntos, +30: máximo score 50. El precio de entrada recomendado debe ser el percentil 10 del mercado (los más baratos con ventas), no el promedio. La recomendación debe incluir consejos específicos para construir reputación desde cero (primeras ventas, precios de lanzamiento, envío gratis inicial).
- Si es "intermedio": Usar precio del percentil 25-50. Score normal según competencia. Recomendación enfocada en diferenciación y optimización.
- Si es "experto": Usar precio del percentil 40-65 (puede acercarse al promedio). Score puede ser más alto en mercados competidos. Recomendación enfocada en escala y volumen.

COMISIONES DE MERCADO LIBRE ${paisComisiones.nombre.toUpperCase()} (datos reales 2026):

Tipo de publicación según perfil:
- principiante → CLÁSICA | intermedio/experto → PREMIUM

Tabla de comisiones para ${paisComisiones.nombre} (${tipoPublicacion.toUpperCase()}):
${Object.entries(tablaComisiones.categorias).map(([cat, pct]) => `- ${cat}: ${pct}%`).join('\n')}

Cargo fijo por unidad: depende del precio de venta en ${currencyCode} — aplicá la lógica del país.
${pais === 'AR' ? '- Precio < 33.000 ARS → 2.500 ARS fijo\n- Precio 33.000-60.000 ARS → 4.000 ARS fijo\n- Precio > 60.000 ARS → sin cargo fijo' : ''}
${pais === 'MX' ? '- Precio < 99 MXN → 25 MXN fijo (solo Clásica)\n- Precio 99-198 MXN → 30 MXN fijo (solo Clásica)\n- Precio 199-298 MXN → 37 MXN fijo (solo Clásica)\n- Precio ≥ 299 MXN → sin cargo fijo' : ''}
${pais === 'CO' ? '- Precio < 50.000 COP → 1.500 COP fijo (solo Clásica)\n- Precio ≥ 50.000 COP → sin cargo fijo' : ''}

Para calcular comision_detalle:
1. tipo_publicacion: "${tipoPublicacion === 'clasica' ? 'Clásica' : 'Premium'}"
2. Estimá la categoría del producto por su nombre
3. porcentaje = % de la tabla de arriba para esa categoría
4. monto_local = round(precio_sugerido_venta × porcentaje / 100) + cargo_fijo
5. monto_usd = round(monto_local / ${rate}, 2)
6. Usá monto_usd como comision_ml_estimada en margen

REGLA DE PRECIO SUGERIDO: ya está definida arriba con los percentiles calculados. Usá exactamente esos valores.

Si el margen resultante es negativo o menor al 10%, indicarlo claramente en el resumen y recomendacion, pero mantener el precio_sugerido dentro del rango de mercado. El vendedor necesita conocer la viabilidad real, no un precio irreal basado solo en su costo.

Datos del scrape (${sample.length} publicaciones de ML):
Cada item tiene: title, price (en ${currencyCode}), soldQuantity (unidades vendidas — null si no hay datos), seller, rating, reviewsCount, isFreeShipping, url.
IMPORTANTE: si soldQuantity es null en la mayoría de los items, NO apliques el cap de score 65 automáticamente — la ausencia de datos de ventas no significa que no haya ventas.
${JSON.stringify(sample)}

PRODUCTOS ALTERNATIVOS (incluir si score <= 74):
Si el score del análisis es 74 o menos, sugerí 2-3 productos alternativos relacionados que podrían tener mejor oportunidad en el mismo mercado.
Para cada alternativa incluir:
- nombre: nombre específico del producto (no genérico)
- razon: por qué tiene mejor oportunidad (1 frase)
- nicho: "específico" | "adyacente" | "segmento"

Ejemplos:
- "Auriculares TWS genéricos" (saturado) → "Auriculares TWS con cancelación de ruido ANC" (específico), "Auriculares óseos deportivos" (adyacente), "Auriculares TWS para niños con limitador de volumen" (segmento)
- "Camiseta deportiva genérica" (saturado) → "Camiseta deportiva UV protection" (específico), "Camiseta térmica running" (adyacente)

Si el veredicto es VIABLE, devolver "productos_alternativos": []

Respondé SOLO con JSON válido (sin markdown):
{"veredicto":"VIABLE"|"SATURADO"|"MARGINAL","score":0-100,"resumen":"Arranca DIRECTO con la conclusión principal (ej: 'El costo es competitivo pero la competencia es alta'). Sin introducción ni contexto genérico. Máximo 3-4 líneas. Incluir el dato más importante para la decisión de compra.","competencia":{"cantidad_vendedores":int,"precio_minimo":${currencyCode},"precio_maximo":${currencyCode},"precio_promedio":${currencyCode},"top_vendedores":[{"nombre":"","precio":${currencyCode},"ventas":int,"reputacion":"ALTA|MEDIA|BAJA","diferenciador":""}],"palabras_clave_titulos":["","","","",""],"distribucion_precios":[{"rango":"","cantidad":int}]},"margen":{"precio_sugerido_venta":${currencyCode},"comision_ml_estimada":USD,"ganancia_estimada":USD,"margen_porcentaje":número,"costo_evaluacion":"COMPETITIVO"|"ALTO"|"MUY_ALTO"},"comision_detalle":{"tipo_publicacion":"Clásica|Premium","porcentaje":número,"monto_ars":número,"monto_usd":número,"cargo_fijo_ars":número},"tendencia":"","estacionalidad":"","diferenciadores_oportunidad":["","",""],"riesgos":["","",""],"recomendacion":"Exactamente 3 bullets separados por ' | '. Cada bullet: acción concreta + por qué. Ordenados de mayor a menor impacto. Ejemplo: 'Entrá al percentil 10 de precios para las primeras 10 ventas — la reputación inicial es más valiosa que el margen | Ofrecé envío gratis los primeros 30 días — mejora conversión 30-40% | Armá combo funda + vidrio templado — diferenciás sin bajar precio'","titulo_sugerido_publicacion":"≤60 chars","analisis_costo_proveedor":{"rango_mayorista_estimado":"USD/unidad","evaluacion":""},"productos_alternativos":[{"nombre":"","razon":"","nicho":"específico"|"adyacente"|"segmento"}]}

REGLA DE TENDENCIA Y ESTACIONALIDAD:
- Si no hay datos de ventas en el scraping, inferí la tendencia basándote en: a) La categoría del producto (electrónica, hogar, moda, etc.) b) El país (Argentina, México, Colombia) c) El contexto general del mercado de e-commerce latinoamericano
- NUNCA devuelvas "No hay datos suficientes" — siempre inferí algo útil
- Ejemplos válidos: "Crecimiento sostenido en electrónica de consumo en Argentina 2024-2026", "Demanda estable con picos en Hot Sale y Navidad", "Categoría en expansión post-pandemia en LATAM"
- Para estacionalidad, si es electrónica: mencionar Hot Sale (mayo), CyberMonday (noviembre), Navidad
- Si es hogar/electrodomésticos: mencionar inicio de año (enero-febrero) y Hot Sale
- Si es moda: temporadas + Hot Sale

REGLAS DE SCORE (aplicar en este orden):
1. Si hay más de 2.000 publicaciones totales en ML (mlData.total): mercado saturado base
2. Escala de competencia por vendedores activos en el scrape:
   - 0-10 vendedores: sin penalización
   - 11-20 vendedores: -10 puntos si es principiante, -5 si es intermedio
   - 21-30 vendedores: -20 puntos si es principiante, -10 si es intermedio, -5 si es experto
   - +30 vendedores: máximo 50 para principiante, máximo 65 para intermedio, máximo 80 para experto
3. Si soldQuantity es null en más del 80% de los listings: máximo 65 (datos insuficientes)
4. Si hay evidencia de ventas reales (soldQuantity > 0 en al menos 3 listings): score puede llegar a 100
5. VIABLE = 75-100 (margen > 25%, competencia manejable) | MARGINAL = 50-74 | SATURADO = 0-49

Reglas generales:
- VIABLE score 75-100 (>25% margen, poca competencia) | MARGINAL 50-74 (10-25% margen) | SATURADO 0-49 (<10% margen)
- costo_evaluacion: COMPETITIVO=similar/menor a importación directa; ALTO=20-50% mayor; MUY_ALTO=>50% mayor
- top_vendedores: los 3 mejores por ventas; distribucion_precios: al menos 2 rangos
- precio_sugerido: según perfil vendedor y REGLA DE PRECIO SUGERIDO arriba, en ${currencyCode}; comision_ml_estimada y ganancia_estimada en USD
- Precios de mercado en ${currencyCode}; comision y ganancia en USD.${datosPro ? `

DATOS ADICIONALES DEL VENDEDOR (usar para personalizar el análisis):
- Origen del producto: ${datosPro.origen_producto || 'no especificado'}
- Presupuesto inicial disponible: ${datosPro.presupuesto_inicial ? `USD ${datosPro.presupuesto_inicial}` : 'no especificado'}
- Producto con variantes: ${datosPro.tiene_variantes || 'no especificado'}${datosPro.detalle_variantes ? ` (${datosPro.detalle_variantes})` : ''}
- Canal de distribución: ${datosPro.canal_distribucion || 'no especificado'}

Con estos datos, personalizar:
- El análisis de costo vs proveedores (¿alcanza el presupuesto para el mínimo de compra mayorista?)
- La estrategia de lanzamiento (según canal de distribución)
- Las oportunidades de diferenciación (según si tiene variantes)
- El análisis de márgenes (según origen del producto y costos de importación)` : ''}`;
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
  const comisionDetalle = (r.comision_detalle ?? null) as Record<string, unknown> | null;

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
    tendencia: typeof r.tendencia === "string" ? r.tendencia : "No pudimos estimar la tendencia para este producto en este momento. El resto del análisis no se ve afectado.",
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
    ...(comisionDetalle ? {
      comision_detalle: {
        tipo_publicacion: typeof comisionDetalle.tipo_publicacion === "string" ? comisionDetalle.tipo_publicacion : "Clásica",
        porcentaje: toNumber(comisionDetalle.porcentaje, 0),
        monto_ars: toNumber(comisionDetalle.monto_ars, 0),
        monto_usd: toNumber(comisionDetalle.monto_usd, 0),
        cargo_fijo_ars: toNumber(comisionDetalle.cargo_fijo_ars, 0),
      },
    } : {}),
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
