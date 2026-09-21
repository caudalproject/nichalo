import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  analysis_id: z.string().uuid(),
});

/**
 * Agrega a la watchlist el nicho de un analisis existente.
 *
 * El producto, el pais, el perfil y el costo NO vienen del cliente: se leen del
 * analisis, que ya es del usuario. Si vinieran del body, cualquiera podria
 * vigilar un nicho con un costo inventado y el score del re-chequeo saldria de
 * ahi.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, producto, pais, costo_estimado, resultado_json, user_id")
    .eq("id", parsed.data.analysis_id)
    .maybeSingle();

  if (!analysis || analysis.user_id !== user.id) {
    return NextResponse.json({ error: "Análisis no encontrado" }, { status: 404 });
  }

  const resultado = (analysis.resultado_json ?? {}) as Record<string, unknown>;
  const perfil =
    typeof resultado.perfil_vendedor === "string"
      ? resultado.perfil_vendedor
      : "principiante";

  const { data: fila, error } = await supabase
    .from("watchlist")
    .upsert(
      {
        user_id: user.id,
        producto: analysis.producto,
        pais: analysis.pais,
        perfil_vendedor: perfil,
        costo_estimado: analysis.costo_estimado,
        // La keyword efectiva del analisis de origen, si la hubo. Sin esto el
        // re-chequeo scrapearia un mercado distinto al que se midio.
        search_keyword:
          typeof resultado.search_keyword === "string" ? resultado.search_keyword : null,
        analysis_id: analysis.id,
        activo: true,
      },
      { onConflict: "user_id,producto,pais,perfil_vendedor" }
    )
    .select("id")
    .single();

  if (error || !fila) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo guardar" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: fila.id });
}
