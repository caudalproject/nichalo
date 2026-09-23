import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inngest } from "@/lib/inngest";
import { cupoDeRechequeos } from "@/lib/cupo-seguimiento";
import type { Plan } from "@/lib/supabase";

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
    .select("id, user_id, producto, pais, search_keyword, ficha_producto, perfil_vendedor, costo_estimado, last_check_at")
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

  // Tope mensual de re-chequeos por plan (TAB 6, 21/9). El cooldown de 6 h de
  // arriba limita la frecuencia POR NICHO, no el gasto total: sin esto, con N
  // nichos el techo de costo es N x 4 x $119 ARS por dia. Se cuentan todas las
  // corridas del mes calendario, incluidas las que fallaron: si el scrape ya
  // salio, Apify lo cobro igual.
  const { data: perfilUsuario } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  const plan = (perfilUsuario?.plan ?? "free") as Plan;

  // El conteo se mudo a lib/cupo-seguimiento.ts en el TAB 5.1: el cron semanal
  // gasta del MISMO cupo que este boton. Con dos conteos separados, un usuario
  // podia gastar su mes a mano el lunes y el cron regalarle un scrape el martes.
  const { tope: topeMensual, restante } = await cupoDeRechequeos(supabase, user.id, plan);

  if (restante <= 0) {
    return NextResponse.json(
      {
        error:
          plan === "pro"
            ? `Llegaste a los ${topeMensual} re-chequeos de este mes. Se renuevan el 1.`
            : `Tu plan incluye ${topeMensual} re-chequeo${topeMensual === 1 ? "" : "s"} por mes. Pasate a Pro para vigilar 5 nichos con re-chequeo semanal.`,
        motivo: "tope_rechequeos",
        tope: topeMensual,
      },
      { status: 403 }
    );
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
      ficha_producto: nicho.ficha_producto,
      perfil_vendedor: nicho.perfil_vendedor ?? "principiante",
      costo_estimado: nicho.costo_estimado,
    },
  });

  return NextResponse.json({ run_id: run.id });
}
