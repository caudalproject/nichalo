import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { scrapeMercadoLibre } from "@/lib/apify";
import { analizarConGemini } from "@/lib/gemini";
import { PLAN_CONFIG } from "@/lib/plans";
import type { Plan, AnalysisResult } from "@/lib/supabase";
import type { MLListing } from "@/lib/apify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAIS_LABEL: Record<string, string> = { AR: "Argentina", MX: "México", CO: "Colombia" };
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
  const { producto, pais, costoEstimado, imagenBase64, imagenMimeType } = parsed.data;

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

  const plan = ((profile?.plan ?? "free") as Plan);
  const planConfig = PLAN_CONFIG[plan];

  if (imagenBase64 && !planConfig.allowImage) {
    return NextResponse.json(
      { error: "plan_no_permite_imagen", detail: "La subida de imagen está disponible desde el plan Pro." },
      { status: 403 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        let analysis: AnalysisResult | null = null;
        let publicacionesAnalizadas = 0;

        // Cache lookup — skip if image is provided (image analyses are always fresh)
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
            send({ step: "cache", msg: "⚡ Usando análisis reciente en caché..." });
            analysis = cached.resultado_json as AnalysisResult;
            publicacionesAnalizadas = cached.publicaciones_analizadas as number;
            send({ step: "verdict", msg: "✅ Generando veredicto final..." });
          }
        }

        if (!analysis) {
          send({
            step: "scraping",
            msg: `🔍 Buscando publicaciones de "${producto}" en Mercado Libre ${PAIS_LABEL[pais] ?? pais}...`,
          });

          const scrape = await scrapeMercadoLibre(producto, pais, plan);
          publicacionesAnalizadas = scrape.totalListings;

          send({
            step: "analyzing",
            msg: `📦 Encontré ${scrape.totalListings} publicaciones. Analizando precios y vendedores...`,
          });

          const topListing = scrape.listings
            .filter((l: MLListing) => l.soldQuantity != null && l.price != null)
            .sort((a: MLListing, b: MLListing) => (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0))[0];

          if (topListing?.seller && topListing.price != null) {
            send({
              step: "topseller",
              msg: `🏆 Top vendedor: ${topListing.seller} vendiendo a $${topListing.price.toFixed(2)} USD...`,
            });
          }

          send({ step: "ai", msg: "🤖 Procesando datos con IA..." });

          analysis = await analizarConGemini({
            producto,
            pais,
            costoEstimadoUsd: costoEstimado,
            scrape,
            imagenBase64,
            imagenMimeType,
          });

          send({ step: "verdict", msg: "✅ Generando veredicto final..." });

          // Persist to cache (skip when image is attached — image analyses are bespoke)
          if (!imagenBase64) {
            const productoNorm = producto.trim().toLowerCase();
            await supabase.from("analysis_cache").upsert(
              {
                producto: productoNorm,
                pais,
                resultado_json: analysis,
                publicaciones_analizadas: publicacionesAnalizadas,
              },
              { onConflict: "producto,pais" }
            );
          }
        }

        const resultadoJson: AnalysisResult = {
          ...analysis,
          publicaciones_analizadas: publicacionesAnalizadas,
          ...(imagenBase64
            ? { imagen_url: `data:${imagenMimeType ?? "image/jpeg"};base64,${imagenBase64}` }
            : {}),
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("analyses")
          .insert({
            user_id: user.id,
            producto,
            pais,
            costo_estimado: costoEstimado,
            resultado_json: resultadoJson,
            score: analysis.score,
            veredicto: analysis.veredicto,
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          send({
            step: "error",
            error: insertErr?.message ?? "Error guardando el análisis.",
          });
          return;
        }

        const { error: updErr } = await supabase
          .from("users")
          .update({ analisis_restantes: Math.max(0, restantes - 1) })
          .eq("id", user.id);

        if (updErr) {
          console.warn("[analizar] failed to decrement credits", updErr.message);
        }

        send({ step: "done", id: inserted.id });
      } catch (err) {
        send({ step: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
