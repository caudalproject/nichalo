import { inngest } from "./inngest";
import { createSupabaseServiceClient } from "./supabase-service";
import { scrapeMercadoLibre } from "./apify";
import { analizarConGemini } from "./gemini";
import type { Plan, AnalysisResult } from "./supabase";

interface AnalizarEvent {
  data: {
    job_id: string;
    user_id: string;
    producto: string;
    pais: "AR" | "MX" | "CO";
    costo_estimado: number;
    plan: Plan;
  };
}

export const analizarProducto = inngest.createFunction(
  { id: "analizar-producto", triggers: [{ event: "nichalo/analisis.requested" }] },
  async ({ event, step }: { event: AnalizarEvent; step: any }) => {
    const { job_id, user_id, producto, pais, costo_estimado, plan } = event.data;
    const supabase = createSupabaseServiceClient();

    const updateJob = (fields: Record<string, unknown>) =>
      supabase
        .from("analysis_jobs")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", job_id);

    try {
      await step.run("update-to-scraping", async () => {
        await updateJob({ status: "scraping", step_message: "Buscando productos en Mercado Libre..." });
      });

      const scrape = await step.run("scrape-mercadolibre", async () => {
        return await scrapeMercadoLibre(producto, pais, plan);
      });

      await step.run("update-to-analyzing", async () => {
        await updateJob({ status: "analyzing", step_message: "Analizando competencia con IA..." });
      });

      const analysis = await step.run("analyze-with-gemini", async () => {
        return await analizarConGemini({
          producto,
          pais,
          costoEstimadoUsd: costo_estimado,
          scrape,
        });
      });

      const analysisId = await step.run("save-and-finalize", async () => {
        const resultadoJson: AnalysisResult = {
          ...analysis,
          publicaciones_analizadas: scrape.totalListings,
        };

        const { data: inserted, error: insertErr } = await supabase
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

        if (insertErr || !inserted) {
          throw new Error(insertErr?.message ?? "Error guardando análisis");
        }

        // Persist to cache (always non-image analyses reach here)
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

        // Decrement credits
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

        return inserted.id as string;
      });

      await step.run("update-to-done", async () => {
        await updateJob({
          status: "done",
          step_message: "¡Análisis completado!",
          analysis_id: analysisId,
        });
      });
    } catch (err) {
      await updateJob({
        status: "error",
        error_message: String(err),
      });
      throw err;
    }
  }
);
