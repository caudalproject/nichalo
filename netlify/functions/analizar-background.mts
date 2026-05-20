import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request) {
  const { job_id, user_id, producto, pais, costo_estimado, plan } = await req.json();

  const updateJob = async (fields: Record<string, unknown>) => {
    await supabase
      .from("analysis_jobs")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", job_id);
  };

  try {
    await updateJob({ status: "scraping", step_message: "Buscando productos en Mercado Libre..." });

    const { startApifyRun, checkApifyRun, getApifyResults } = await import("../../lib/apify");
    const { PLAN_CONFIG } = await import("../../lib/plans");

    const runId = await startApifyRun(producto, pais, plan);

    // Polling de Apify (hasta 120 segundos)
    let apifyStatus = "RUNNING";
    let attempts = 0;
    while (apifyStatus === "RUNNING" || apifyStatus === "READY" || apifyStatus === "CREATED") {
      if (attempts > 40) throw new Error("Apify timeout después de 120 segundos");
      await new Promise((r) => setTimeout(r, 3000));
      const result = await checkApifyRun(runId);
      apifyStatus = result.status;
      attempts++;
    }

    if (apifyStatus !== "SUCCEEDED") {
      throw new Error(`Apify falló con status: ${apifyStatus}`);
    }

    const { maxItems } = PLAN_CONFIG[plan];
    const scrape = await getApifyResults(runId, producto, pais, maxItems);

    await updateJob({ status: "analyzing", step_message: "Analizando competencia con IA..." });

    const { analizarConGemini } = await import("../../lib/gemini");
    const analysis = await analizarConGemini({
      producto,
      pais,
      costoEstimadoUsd: costo_estimado,
      scrape,
    });

    const resultadoJson = {
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

    if (insertErr || !inserted) throw new Error(insertErr?.message ?? "Error guardando análisis");

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

    await updateJob({
      status: "done",
      step_message: "¡Análisis completado!",
      analysis_id: inserted.id,
    });
  } catch (err) {
    await supabase
      .from("analysis_jobs")
      .update({
        status: "error",
        error_message: String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);
  }
}

export const config = { path: "/api/analizar-background" };
