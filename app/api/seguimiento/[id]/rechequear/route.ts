import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inngest } from "@/lib/inngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un re-chequeo manual por nicho cada 6 horas. El mercado no se mueve mas
 *  rapido que eso, y cada corrida paga un scrape de Apify (~$119 ARS). */
const ESPERA_MIN_MS = 6 * 60 * 60 * 1000;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: nicho } = await supabase
    .from("watchlist")
    .select("id, user_id, producto, pais, search_keyword, perfil_vendedor, costo_estimado, last_check_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!nicho || nicho.user_id !== user.id) {
    return NextResponse.json({ error: "Nicho no encontrado" }, { status: 404 });
  }

  if (nicho.last_check_at) {
    const desde = Date.now() - new Date(nicho.last_check_at).getTime();
    if (desde < ESPERA_MIN_MS) {
      const horas = Math.ceil((ESPERA_MIN_MS - desde) / 3_600_000);
      return NextResponse.json(
        { error: `Ya se midió hace poco. Volvé a intentar en ${horas} h.` },
        { status: 429 }
      );
    }
  }

  // El insert es la traba real contra el doble click: hay un indice unico
  // parcial (watch_runs_una_en_vuelo) que permite una sola corrida pendiente o
  // scrapeando por nicho. Dos requests simultaneos pasan los dos por el chequeo
  // de arriba, pero solo uno entra aca.
  const { data: run, error } = await supabase
    .from("watch_runs")
    .insert({ watchlist_id: nicho.id, origen: "manual", status: "pending" })
    .select("id")
    .single();

  if (error || !run) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Ya hay un re-chequeo en curso para este nicho." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "No se pudo encolar" },
      { status: 500 }
    );
  }

  await inngest.send({
    name: "nichalo/seguimiento.rechequeo",
    data: {
      run_id: run.id,
      watchlist_id: nicho.id,
      producto: nicho.producto,
      pais: nicho.pais,
      search_keyword: nicho.search_keyword,
      perfil_vendedor: nicho.perfil_vendedor ?? "principiante",
      costo_estimado: nicho.costo_estimado,
    },
  });

  return NextResponse.json({ run_id: run.id });
}
