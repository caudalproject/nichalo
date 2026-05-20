import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Plan, AnalysisResult } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const BodySchema = z.object({
  producto: z.string().min(2).max(120),
  pais: z.enum(["AR", "MX", "CO"]),
  costoEstimado: z.number().positive().max(1_000_000),
  imagenBase64: z.string().optional(),
  imagenMimeType: z.string().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { producto, pais, costoEstimado, imagenBase64 } = parsed.data;

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id, plan, analisis_restantes")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json(
      { error: "profile_lookup_failed", detail: profileErr.message },
      { status: 500 }
    );
  }

  let restantes = profile?.analisis_restantes ?? 0;
  if (!profile) {
    const { error: insertErr } = await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      plan: "free",
      analisis_restantes: 1,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: "profile_create_failed", detail: insertErr.message },
        { status: 500 }
      );
    }
    restantes = 1;
  }

  if (restantes <= 0) {
    return NextResponse.json({ error: "no_credits_left" }, { status: 402 });
  }

  const plan = (profile?.plan ?? "free") as Plan;

  try {
    // --- Cache lookup (only when no image) ---
    if (!imagenBase64) {
      const productoNorm = producto.trim().toLowerCase();
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

      const { data: cached } = await supabase
        .from("analysis_cache")
        .select("resultado_json, publicaciones_analizadas")
        .eq("producto", productoNorm)
        .eq("pais", pais)
        .gte("created_at", cutoff)
        .maybeSingle();

      if (cached) {
        const resultadoJson = cached.resultado_json as AnalysisResult;
        resultadoJson.publicaciones_analizadas = cached.publicaciones_analizadas as number;

        const { data: inserted, error: insertErr } = await supabase
          .from("analyses")
          .insert({
            user_id: user.id,
            producto,
            pais,
            costo_estimado: costoEstimado,
            resultado_json: resultadoJson,
            score: resultadoJson.score,
            veredicto: resultadoJson.veredicto,
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          return NextResponse.json(
            { error: insertErr?.message ?? "Error guardando el análisis." },
            { status: 500 }
          );
        }

        await supabase
          .from("users")
          .update({ analisis_restantes: Math.max(0, restantes - 1) })
          .eq("id", user.id);

        return NextResponse.json({ id: inserted.id });
      }
    }

    // --- Image analysis: temporarily disabled ---
    if (imagenBase64) {
      return NextResponse.json(
        { error: "El análisis con imagen está temporalmente deshabilitado. Usá el análisis estándar." },
        { status: 503 }
      );
    }

    // --- No cache, no image: create job and fire background function ---
    const { data: job, error: jobErr } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: user.id,
        producto,
        pais,
        costo_estimado: costoEstimado,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { error: jobErr?.message ?? "Error creando el job." },
        { status: 500 }
      );
    }

    // Fire-and-forget: no await
    const bgUrl =
      process.env.NODE_ENV === "production"
        ? `${process.env.SITE_URL}/.netlify/functions/analizar-background`
        : `${process.env.SITE_URL}/api/analizar-background`;

    fetch(bgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job.id,
        user_id: user.id,
        producto,
        pais,
        costo_estimado: costoEstimado,
        plan,
      }),
    }).catch(() => {});

    return NextResponse.json({ job_id: job.id }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
