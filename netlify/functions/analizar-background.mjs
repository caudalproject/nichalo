import { createClient } from "@supabase/supabase-js";
import { startApifyRun, checkApifyRun, getApifyResults } from "../../lib/apify.js";
import { analizarConGemini } from "../../lib/gemini.js";
import { PLAN_CONFIG } from "../../lib/plans.js";
import { getCurrencyForCountry, getExchangeRate } from "../../lib/currency.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const updateJob = async (job_id, fields) => {
  await supabase
    .from("analysis_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", job_id);
};

export default async function handler(req) {
  const { job_id, user_id, producto, pais, costo_estimado, plan, perfil_vendedor } = await req.json();

  let inserted = null; // visible en catch para saber si el análisis fue guardado

  try {
    await updateJob(job_id, { status: "scraping", step_message: "Buscando productos en Mercado Libre..." });

    const runId = await startApifyRun(producto, pais, plan);

    let apifyStatus = "RUNNING";
    let attempts = 0;
    while (["RUNNING", "READY", "CREATED"].includes(apifyStatus)) {
      if (attempts > 40) throw new Error("Apify timeout después de 120 segundos");
      await new Promise(r => setTimeout(r, 3000));
      const result = await checkApifyRun(runId);
      apifyStatus = result.status;
      attempts++;
    }

    if (apifyStatus !== "SUCCEEDED") {
      throw new Error(`Apify falló con status: ${apifyStatus}`);
    }

    const { maxItems } = PLAN_CONFIG[plan];
    const scrape = await getApifyResults(runId, producto, pais, maxItems);

    await updateJob(job_id, { status: "analyzing", step_message: "Analizando competencia con IA..." });

    const currency = getCurrencyForCountry(pais);
    const exchangeRate = await getExchangeRate(currency.code);

    let analysis;
    let geminiAttempts = 0;
    while (geminiAttempts < 4) {
      try {
        analysis = await analizarConGemini({
          producto,
          pais,
          costoEstimadoUsd: costo_estimado,
          scrape,
          currency,
          exchangeRate,
          perfilVendedor: perfil_vendedor,
        });
        break;
      } catch (err) {
        geminiAttempts++;
        if (geminiAttempts >= 4) throw err;
        const wait = geminiAttempts * 10000;
        console.log(`[gemini] Intento ${geminiAttempts} fallido, reintentando en ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }

    const resultadoJson = {
      ...analysis,
      publicaciones_analizadas: scrape.totalListings,
      moneda: currency.code,
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

    if (insertErr || !insertData) throw new Error(insertErr?.message ?? "Error guardando análisis");
    inserted = insertData;

    const productoNorm = producto.trim().toLowerCase();
    await supabase.from("analysis_cache").upsert(
      { producto: productoNorm, pais, resultado_json: resultadoJson, publicaciones_analizadas: scrape.totalListings },
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
      analysis_id: inserted.id,
    });

  } catch (err) {
    console.error("[analizar-background] Error:", err);

    // Si el análisis no fue guardado, el crédito no debería haberse descontado.
    // Este bloque es un safety net para restaurarlo si por algún motivo se decrementó.
    if (!inserted) {
      try {
        const { data: userRow } = await supabase
          .from("users")
          .select("analisis_restantes")
          .eq("id", user_id)
          .single();
        if (userRow) {
          await supabase
            .from("users")
            .update({ analisis_restantes: userRow.analisis_restantes + 1 })
            .eq("id", user_id);
          console.log(`[analizar-background] Crédito restaurado para user ${user_id}`);
        }
      } catch (restoreErr) {
        console.error("[analizar-background] Error restaurando crédito:", restoreErr);
      }
    }

    await updateJob(job_id, {
      status: "error",
      error_message: String(err),
    });
  }
}
