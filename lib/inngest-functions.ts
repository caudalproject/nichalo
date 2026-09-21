import { NonRetriableError } from "inngest";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { inngest } from "./inngest";
import { startApifyRun, checkApifyRun, getApifyResults } from "./apify";
import { analizarConGemini } from "./gemini";
import { PLAN_CONFIG } from "./plans";
import { getCurrencyForCountry, getExchangeRate } from "./currency";
import { sendAnalysisReadyEmail } from "./resend";
// mercadolibre functions imported dynamically inside the step
import type { Plan } from "./supabase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const updateJob = async (job_id: string, fields: Record<string, unknown>) => {
  await supabase
    .from("analysis_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", job_id);
};

export const analizarProducto = inngest.createFunction(
  {
    id: "analizar-producto",
    triggers: [{ event: "nichalo/analisis.requested" }],
    retries: 20,
  },
  async ({ event, step }) => {
    const {
      job_id,
      user_id,
      producto,
      pais,
      costo_estimado,
      plan,
      perfil_vendedor,
      search_keyword,
      datos_pro,
      reintento_de,
    } = event.data as {
      job_id: string;
      user_id: string;
      producto: string;
      pais: "AR" | "MX" | "CO";
      costo_estimado: number;
      plan: Plan;
      perfil_vendedor: string;
      search_keyword?: string;
      datos_pro?: {
        origen_producto?: string | null;
        presupuesto_inicial?: number | null;
        tiene_variantes?: string | null;
        detalle_variantes?: string | null;
        canal_distribucion?: string | null;
      } | null;
      /** Ya validado por la route; aca solo se aplica. */
      reintento_de?: string | null;
    };

    try {
      // Step 1: Iniciar scraping en Apify
      const runId = await step.run("start-apify", async () => {
        await updateJob(job_id, {
          status: "scraping",
          step_message: "Buscando productos en Mercado Libre...",
        });
        return await startApifyRun(search_keyword ?? producto, pais, plan);
      });

      // Step 2: Polling de Apify — cada retry chequea si terminó
      const scrape = await step.run(
        "wait-apify",
        async () => {
          await updateJob(job_id, { step_message: "Scrapeando publicaciones de Mercado Libre..." });
          const result = await checkApifyRun(runId);

          if (["FAILED", "ABORTED", "TIMED-OUT"].includes(result.status)) {
            throw new NonRetriableError(`Apify falló con status: ${result.status}`);
          }

          if (result.status !== "SUCCEEDED") {
            // Todavía corriendo — Inngest reintenta automáticamente
            throw new Error(`Apify en progreso: ${result.status}`);
          }

          const { maxItems } = PLAN_CONFIG[plan];
          return await getApifyResults(runId, producto, pais, maxItems);
        },
      );

      // Step 2b: Si Apify devolvió 0 resultados, intentar con keyword simplificada
      const fallbackRunId = await step.run("apify-fallback-start", async () => {
        if (scrape.totalListings > 0) return null;
        await updateJob(job_id, { step_message: "Buscando con keywords alternativas..." });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return null;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel(
          { model: "gemini-2.5-flash" },
          { apiVersion: "v1" }
        );

        const prompt = `El usuario quiere vender "${producto}" en Mercado Libre ${pais}.
Generá UNA sola keyword corta (2-3 palabras máximo) que un comprador usaría para buscar este producto en Mercado Libre.
Respondé SOLO con la keyword, sin explicación.
Ejemplo: "difusor aromas" en vez de "difusor de aromas ultrasónico"`;

        try {
          const result = await model.generateContent([{ text: prompt }]);
          const simplifiedKeyword = result.response.text().trim().split('\n')[0].trim();
          if (!simplifiedKeyword || simplifiedKeyword.length > 40 || simplifiedKeyword.split(' ').length > 4) {
            console.log("[apify] fallback keyword inválida, abortando:", simplifiedKeyword);
            return null;
          }

          return await startApifyRun(simplifiedKeyword, pais, plan);
        } catch {
          return null;
        }
      });

      // Step 2c: Polling del fallback run (se omite si no hubo fallback)
      const finalScrape = await step.run("apify-fallback-wait", async () => {
        if (!fallbackRunId) return scrape;
        await updateJob(job_id, { step_message: "Obteniendo más publicaciones..." });

        const result = await checkApifyRun(fallbackRunId);

        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(result.status)) {
          return scrape;
        }

        if (result.status !== "SUCCEEDED") {
          throw new Error(`Apify fallback en progreso: ${result.status}`);
        }

        const { maxItems } = PLAN_CONFIG[plan];
        const fallbackScrape = await getApifyResults(fallbackRunId, producto, pais, maxItems);
        return fallbackScrape;
      });

      // Step 4: Tendencias de Google Trends.
      // Antes tambien pedia "total de publicaciones" y "tendencias" a la API
      // publica de Mercado Libre (api.mercadolibre.com/sites/*/search y
      // /trends/*). Las dos devuelven 403 (PA_UNAUTHORIZED_RESULT_FROM_POLICIES)
      // desde que ML cerro el acceso sin token, y fallaban en silencio via
      // catch => 0 / catch => []. Sacado del prompt el 20/9 (TAB 1) en vez de
      // seguir mandando datos falsos. Google Trends es la unica fuente de esta
      // familia que sigue viva.
      const mlData = await step.run("fetch-ml-data", async () => {
        await updateJob(job_id, { step_message: "Analizando tendencias del mercado..." });
        const { getGoogleTrends } = await import("./mercadolibre");
        const trends = await getGoogleTrends(producto, pais).catch((err) => {
          console.error("[ml-data] getGoogleTrends fallo, sigue sin datos de tendencia:", err);
          return undefined;
        });
        if (trends && trends.interest === 0 && !trends.trending && trends.related.length === 0) {
          console.warn("[ml-data] getGoogleTrends devolvio el default vacio (posible fallo interno silencioso) para:", producto, pais);
        }
        return { trends };
      });

      // Step 5: Análisis con Gemini
      const analysis = await step.run(
        "analyze-with-gemini",
        async () => {
          await updateJob(job_id, {
            status: "analyzing",
            step_message: "Analizando competencia con IA...",
          });

          const currency = getCurrencyForCountry(pais);
          const exchangeRate = await getExchangeRate(currency.code);

          // El promedio aca era una media aritmetica cruda: una publicacion de
          // $2.695.000 arrastraba el promedio de "Silla gamer" a $278.213. Ahora
          // el recorte, los percentiles y el nivel de confianza salen de
          // `lib/confianza.ts`, y la confianza viaja hasta la UI.
          const { calcularPrecioStats } = await import("./confianza");
          const precios = finalScrape.listings
            .map(l => l.price)
            .filter((p): p is number => p !== null && p > 0);
          const totalConVentas = finalScrape.listings.filter(l => (l.soldQuantity ?? 0) > 0).length;

          // El costo se ingresa en USD; los precios del scrape estan en moneda
          // local. Hay que compararlos en la misma moneda o la senal de
          // "costo fuera de rango" se dispara siempre.
          const costoLocal = costo_estimado * (exchangeRate ?? 1);
          const calculado = calcularPrecioStats(precios, totalConVentas, costoLocal);
          const precioStats = calculado?.stats ?? null;

          // EL SCORE SE CALCULA ACA, ANTES DE HABLAR CON GEMINI (TAB 3, 20/9).
          // El orden importa: el modelo recibe el veredicto ya hecho y su
          // trabajo pasa a ser explicarlo. Mientras el numero salia del LLM,
          // dos corridas identicas daban SATURADO y MARGINAL (medido el 13/9,
          // 45 puntos de variacion con el mismo scrape).
          const { calcularScore } = await import("./score");
          const scoreCalculado = precioStats
            ? calcularScore({
                producto,
                pais,
                perfil: perfil_vendedor ?? "principiante",
                costoLocal,
                listings: finalScrape.listings,
                stats: precioStats,
                confianza: calculado?.confianza ?? null,
              })
            : null;

          if (!scoreCalculado) {
            throw new NonRetriableError(
              "No se encontraron precios válidos en las publicaciones. Intentá con un término más específico."
            );
          }

          if (finalScrape.totalListings === 0) {
            throw new NonRetriableError(
              "No se encontraron publicaciones en Mercado Libre para este producto. Intentá con un término más general."
            );
          }

          const resultado = await analizarConGemini({
            producto,
            pais,
            costoEstimadoUsd: costo_estimado,
            scrape: finalScrape,
            currency,
            exchangeRate,
            perfilVendedor: perfil_vendedor,
            mlData,
            datosPro: datos_pro ?? undefined,
            precioStats: precioStats ?? undefined,
            confianza: calculado?.confianza,
            score: scoreCalculado,
          });

          // La confianza y los percentiles viajan por el RETORNO del step, no
          // por una variable de afuera: en un replay de Inngest este step no se
          // vuelve a ejecutar (se lee del cache) y una variable externa quedaria
          // en null, con la UI mostrando "alta confianza" sobre datos sucios.
          return {
            ...resultado,
            confianza: calculado?.confianza ?? null,
            precio_stats: calculado?.stats ?? null,
            // El desglose del score y las metricas crudas viajan al
            // resultado_json. Dos motivos: la pagina de resultado (TAB 4) tiene
            // que poder mostrar la aritmetica del veredicto, y el seguimiento
            // (TAB 5) necesita una serie de metricas comparables entre fechas.
            // Hasta hoy no se guardaba ninguna metrica del scrape, y por eso la
            // pregunta "cuanto cambio este nicho" no se podia responder ni
            // retroactivamente ni hacia adelante.
            score_detalle: {
              formula: scoreCalculado.formula,
              score_bruto: scoreCalculado.score_bruto,
              puntos_obtenidos: scoreCalculado.puntos_obtenidos,
              puntos_posibles: scoreCalculado.puntos_posibles,
              componentes: scoreCalculado.componentes,
              omitidos: scoreCalculado.omitidos,
              techo_aplicado: scoreCalculado.techo_aplicado,
              motivo_techo: scoreCalculado.motivo_techo,
            },
            metricas: scoreCalculado.metricas,
          };
        },
      );

      // Step 6a: Guardar análisis en DB y cachear
      const savedAnalysis = await step.run("save-analysis", async () => {
        const resultadoJson = {
          ...analysis,
          publicaciones_analizadas: finalScrape.totalListings,
          // Columna deprecada el 20/9 (TAB 1): salia de la API de ML que hoy
          // devuelve 403. Se deja en 0 en vez de borrar la columna (fuera de
          // alcance de este tab). No se usa en ningun lado de la UI.
          total_publicaciones_ml: 0,
          google_trends_interest: mlData?.trends?.interest ?? 0,
          google_trends_trending: mlData?.trends?.trending ?? false,
        };

        const { data: insertData, error: insertErr } = await supabase
          .from("analyses")
          .insert({
            user_id,
            producto,
            pais,
            costo_estimado,
            resultado_json: resultadoJson,
            score: analysis.score,
            veredicto: analysis.veredicto,
            reintento_de: reintento_de ?? null,
          })
          .select("id")
          .single();

        if (insertErr || !insertData) {
          throw new Error(insertErr?.message ?? "Error guardando análisis");
        }

        const productoNorm = producto.trim().toLowerCase();
        // costo_estimado entra en la clave: el resultado_json cacheado incluye
        // margen, ganancia, costo_evaluacion y (desde el 16/9) la senal de
        // confianza costo_fuera_de_rango, todos calculados CON ese costo.
        // Servirlo a alguien que ingreso otro costo le daba los numeros de un
        // desconocido. El onConflict tiene que coincidir exactamente con la
        // constraint analysis_cache_unique_key.
        const { error: cacheErr } = await supabase.from("analysis_cache").upsert(
          {
            producto: productoNorm,
            pais,
            perfil_vendedor: perfil_vendedor ?? "principiante",
            costo_estimado,
            resultado_json: resultadoJson,
            publicaciones_analizadas: finalScrape.totalListings,
            created_at: new Date().toISOString(),
          },
          { onConflict: "producto,pais,perfil_vendedor,costo_estimado" }
        );
        // El cache es una optimizacion: si falla, el analisis ya esta guardado
        // y el usuario no se entera. Pero se loguea, porque antes este upsert
        // no chequeaba error y no habia forma de saber si estaba escribiendo.
        if (cacheErr) {
          console.error("[cache] no se pudo escribir:", cacheErr.message);
        }

        return { analysisId: insertData.id, resultadoJson };
      });

      // Step 6b: Decrementar crédito del usuario.
      // Un reintento por confianza baja no descuenta: el análisis que lo
      // originó ya se cobró y no sirvió (Capa 4, 16/9).
      await step.run("decrement-credits", async () => {
        if (reintento_de) return;
        await supabase.rpc("descontar_analisis", { user_id_param: user_id });
      });

      // Step 6c: Marcar job como done
      await step.run("complete-job", async () => {
        await updateJob(job_id, {
          status: "done",
          step_message: "¡Análisis completado!",
          analysis_id: savedAnalysis.analysisId,
        });
      });

      // Step 6d: Enviar email (aislado — si falla no afecta el resultado)
      await step.run("send-email", async () => {
        const { data: userRow } = await supabase
          .from("users")
          .select("email")
          .eq("id", user_id)
          .single();

        if (userRow?.email) {
          await sendAnalysisReadyEmail(
            userRow.email,
            producto,
            analysis.veredicto,
            analysis.score,
            savedAnalysis.analysisId,
          );
        }
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isPollingRetry =
        errMsg.includes("Apify en progreso") ||
        errMsg.includes("Apify fallback en progreso");

      if (!isPollingRetry) {
        await updateJob(job_id, {
          status: "error",
          error_message: errMsg.includes("Gemini") || errMsg.includes("Apify")
            ? "Error al analizar el producto. Intentá de nuevo."
            : errMsg,
        });
      }
      throw err;
    }
  }
);
