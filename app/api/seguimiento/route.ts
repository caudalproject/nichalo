import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PLAN_CONFIG } from "@/lib/plans";
import type { Plan } from "@/lib/supabase";

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

  // Tope de nichos por plan (TAB 6). Se chequea DESPUES de resolver el perfil
  // porque el upsert de abajo desduplica por (user, producto, pais, perfil):
  // volver a guardar un nicho que ya esta en la lista no consume cupo, y por
  // eso no puede bloquearse por conteo.
  const { data: perfilUsuario } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  const plan = (perfilUsuario?.plan ?? "free") as Plan;
  const topeNichos = PLAN_CONFIG[plan].nichosVigilados;

  const { data: yaEsta } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("producto", analysis.producto)
    .eq("pais", analysis.pais)
    .eq("perfil_vendedor", perfil)
    .maybeSingle();

  if (!yaEsta) {
    const { count } = await supabase
      .from("watchlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("activo", true);

    if ((count ?? 0) >= topeNichos) {
      return NextResponse.json(
        {
          error:
            topeNichos === 1
              ? "Tu plan permite vigilar 1 nicho. Dejá de vigilar el actual o pasate a Pro para vigilar 5."
              : `Tu plan permite vigilar ${topeNichos} nichos a la vez.`,
          motivo: "tope_nichos",
          tope: topeNichos,
        },
        { status: 403 }
      );
    }
  }

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
