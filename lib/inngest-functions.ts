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

      // Step 3: Obtener tendencias de ML
      const mlTrends = await step.run("fetch-ml-trends", async () => {
        await updateJob(job_id, { step_message: "Analizando tendencias del mercado..." });
        const siteMap: Record<string, string> = {
          AR: "MLA",
          MX: "MLM",
          CO: "MCO",
        };
        const siteId = siteMap[pais] ?? "MLA";

        try {
          const res = await fetch(
            `https://api.mercadolibre.com/trends/${siteId}`,
            { headers: { "Content-Type": "application/json" } }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return data.slice(0, 20).map((t: { keyword: string }) => t.keyword);
        } catch {
          return [];
        }
      });

      // Step 4: Obtener total de ML y tendencias de Google en paralelo
      const mlData = await step.run("fetch-ml-data", async () => {
        await updateJob(job_id, { step_message: "Calculando tamaño del mercado..." });
        const { getMLSearchTotal, getGoogleTrends } = await import("./mercadolibre");
        const [total, trends] = await Promise.all([
          getMLSearchTotal(producto, pais).catch(() => 0),
          getGoogleTrends(producto, pais).catch(() => undefined),
        ]);
        return { total, trends };
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

          const precios = finalScrape.listings
            .map(l => l.price)
            .filter((p): p is number => p !== null && p > 0)
            .sort((a, b) => a - b);

          const precioStats = precios.length > 0 ? {
            precio_minimo: precios[0],
            precio_maximo: precios[precios.length - 1],
            precio_promedio: Math.round(precios.reduce((a, b) => a + b, 0) / precios.length),
            p10: precios[Math.floor(precios.length * 0.10)] ?? precios[0],
            p25: precios[Math.floor(precios.length * 0.25)] ?? precios[0],
            p50: precios[Math.floor(precios.length * 0.50)] ?? precios[0],
            p65: precios[Math.floor(precios.length * 0.65)] ?? precios[precios.length - 1],
            total_con_precio: precios.length,
            total_con_ventas: finalScrape.listings.filter(l => (l.soldQuantity ?? 0) > 0).length,
          } : null;

          if (finalScrape.totalListings === 0) {
            throw new NonRetriableError(
              "No se encontraron publicaciones en Mercado Libre para este producto. Intentá con un término más general."
            );
          }

          return await analizarConGemini({
            producto,
            pais,
            costoEstimadoUsd: costo_estimado,
            scrape: finalScrape,
            currency,
            exchangeRate,
            perfilVendedor: perfil_vendedor,
            mlTrends,
            mlData,
            datosPro: datos_pro ?? undefined,
            precioStats: precioStats ?? undefined,
          });
        },
      );

      // Step 6a: Guardar análisis en DB y cachear
      const savedAnalysis = await step.run("save-analysis", async () => {
        const resultadoJson = {
          ...analysis,
          publicaciones_analizadas: finalScrape.totalListings,
          total_publicaciones_ml: mlData?.total ?? 0,
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
          })
          .select("id")
          .single();

        if (insertErr || !insertData) {
          throw new Error(insertErr?.message ?? "Error guardando análisis");
        }

        const productoNorm = producto.trim().toLowerCase();
        await supabase.from("analysis_cache").upsert(
          {
            producto: productoNorm,
            pais,
            perfil_vendedor: perfil_vendedor ?? "principiante",
            resultado_json: resultadoJson,
            publicaciones_analizadas: finalScrape.totalListings,
            created_at: new Date().toISOString(),
          },
          { onConflict: "producto,pais,perfil_vendedor" }
        );

        return { analysisId: insertData.id, resultadoJson };
      });

      // Step 6b: Decrementar crédito del usuario
      await step.run("decrement-credits", async () => {
        await supabase.rpc("decrement_analisis_restantes", { user_id_param: user_id });
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
