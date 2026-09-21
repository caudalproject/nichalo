import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/Navbar";
import { NichoVigilado, type NichoProps } from "@/components/NichoVigilado";
import { calcularDelta, type CorridaComparable } from "@/lib/delta";

export const dynamic = "force-dynamic";

export default async function VigilanciaPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/vigilancia");

  const { data: nichos } = await supabase
    .from("watchlist")
    .select("id, producto, pais, last_check_at")
    .eq("user_id", user.id)
    .eq("activo", true)
    .order("created_at", { ascending: false });

  const ids = (nichos ?? []).map((n) => n.id);

  // Las dos ultimas corridas terminadas de cada nicho, en una sola consulta.
  // Se traen las ultimas 40 y se agrupan en memoria: con la escala de hoy
  // (pocos nichos por usuario) no justifica una vista ni un RPC.
  const { data: corridas } = ids.length
    ? await supabase
        .from("watch_runs")
        .select(
          "id, watchlist_id, fetched_at, status, n_listings, precio_stats, metricas, vendedores, score, formula, error_message"
        )
        .in("watchlist_id", ids)
        .order("fetched_at", { ascending: false })
        .limit(40)
    : { data: [] };

  const porNicho = new Map<string, typeof corridas>();
  for (const c of corridas ?? []) {
    const lista = porNicho.get(c.watchlist_id) ?? [];
    lista.push(c);
    porNicho.set(c.watchlist_id, lista);
  }

  const preparados: NichoProps[] = (nichos ?? []).map((n) => {
    const todas = porNicho.get(n.id) ?? [];
    const hechas = todas.filter((c) => c.status === "done");
    const corriendo = todas.some(
      (c) => c.status === "pending" || c.status === "scraping"
    );
    const fallida = todas.find((c) => c.status === "error");

    // Las dos ultimas terminadas, en orden. Con una sola no hay delta: no se
    // compara contra nada, y eso se dice, no se disimula.
    const [actual, anterior] = hechas;
    const delta =
      actual && anterior
        ? calcularDelta(
            anterior as unknown as CorridaComparable,
            actual as unknown as CorridaComparable
          )
        : null;

    return {
      id: n.id,
      producto: n.producto,
      pais: n.pais,
      last_check_at: n.last_check_at,
      mediciones: hechas.length,
      delta,
      corriendo,
      error: corriendo || hechas.length ? null : (fallida?.error_message ?? null),
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Nichos que estás vigilando
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Un análisis es una foto. Esto es la película: qué cambió en el nicho
            desde la última vez que lo miraste.
          </p>
        </header>

        {preparados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-700">
              Todavía no estás vigilando ningún nicho.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Abrí cualquier análisis tuyo y tocá “Vigilar este nicho”.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm font-medium text-[#16A34A] hover:underline"
            >
              Ver mis análisis
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {preparados.map((n) => (
              <NichoVigilado key={n.id} nicho={n} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
