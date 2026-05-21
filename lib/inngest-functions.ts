import { NonRetriableError } from "inngest";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "./inngest";
import { startApifyRun, checkApifyRun, getApifyResults } from "./apify";
import { analizarConGemini } from "./gemini";
import { PLAN_CONFIG } from "./plans";
import { getCurrencyForCountry, getExchangeRate } from "./currency";
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
  { id: "analizar-producto", retries: 0 },
  { event: "nichalo/analisis.requested" },
  async ({ event, step }) => {
    const {
      job_id,
      user_id,
      producto,
      pais,
      costo_estimado,
      plan,
      perfil_vendedor,
    } = event.data as {
      job_id: string;
      user_id: string;
      producto: string;
      pais: "AR" | "MX" | "CO";
      costo_estimado: number;
      plan: Plan;
      perfil_vendedor: string;
    };

    try {
      // Step 1: Iniciar scraping en Apify
      const runId = await step.run("start-apify", async () => {
        await updateJob(job_id, {
          status: "scraping",
          step_message: "Buscando productos en Mercado Libre...",
        });
        return await startApifyRun(producto, pais, plan);
      });

      // Step 2: Polling de Apify — cada retry chequea si terminó
      const scrape = await step.run(
        "wait-apify",
        async () => {
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
        { retryCount: 20 }
      );

      // Step 3: Análisis con Gemini
      const analysis = await step.run(
        "analyze-with-gemini",
        async () => {
          await updateJob(job_id, {
            status: "analyzing",
            step_message: "Analizando competencia con IA...",
          });

          const currency = getCurrencyForCountry(pais);
          const exchangeRate = await getExchangeRate(currency.code);

          return await analizarConGemini({
            producto,
            pais,
            costoEstimadoUsd: costo_estimado,
            scrape,
            currency,
            exchangeRate,
            perfilVendedor: perfil_vendedor,
          });
        },
        { retryCount: 5 }
      );

      // Step 4: Guardar resultados, cachear y decrementar créditos
      await step.run("save-results", async () => {
        const resultadoJson = {
          ...analysis,
          publicaciones_analizadas: scrape.totalListings,
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
            resultado_json: resultadoJson,
            publicaciones_analizadas: scrape.totalListings,
          },
          { onConflict: "producto,pais" }
        );

        const { data: userRow } = await supabase
          .from("users")
          .select("analisis_restantes")
          .eq("id", user_id)
          .single();

        if (userRow) {
          await supabase
            .from("users")
            .update({ analisis_restantes: Math.max(0, userRow.analisis_restantes - 1) })
            .eq("id", user_id);
        }

        await updateJob(job_id, {
          status: "done",
          step_message: "¡Análisis completado!",
          analysis_id: insertData.id,
        });
      });
    } catch (err) {
      await updateJob(job_id, {
        status: "error",
        error_message: String(err),
      });
      throw err;
    }
  }
);
