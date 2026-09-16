import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { bootstrapNewUser } from "@/lib/new-user-bootstrap";
import { cookies, headers } from "next/headers";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardList } from "@/components/DashboardList";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { PixelRegistration } from "@/components/PixelRegistration";
import type { AnalysisRow, UserRow, Plan } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const sinCredito = searchParams?.sin_credito === "1";
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  let profile:
    | (Pick<UserRow, "plan" | "creditos_ciclo" | "creditos_pack" | "email"> & {
        credit_bootstrap_done?: boolean;
      })
    | null = null;
  const { data: profileData } = await supabase
    .from("users")
    .select("plan, creditos_ciclo, creditos_pack, email, credit_bootstrap_done")
    .eq("id", user.id)
    .maybeSingle();
  profile = profileData;

  if (!profile) {
    profile = { plan: "free", creditos_ciclo: 0, creditos_pack: 1, email: user.email ?? "" };
  }

  // Red de seguridad: si el credito gratis nunca se otorgo (ej. el usuario
  // se registro por OTP con mala red y cerro la pestana antes de que el
  // retry del cliente terminara), disparamos el bootstrap aca. Es idempotente
  // (bootstrapNewUser gatea con credit_bootstrap_done=false -> true).
  if (profile?.credit_bootstrap_done === false) {
    await bootstrapNewUser(user, headers(), cookies());
    const { data: refreshed } = await supabase
      .from("users")
      .select("plan, creditos_ciclo, creditos_pack, email, credit_bootstrap_done")
      .eq("id", user.id)
      .maybeSingle();
    if (refreshed) {
      profile = refreshed;
    }
  }

  const analisisRestantes = (profile?.creditos_ciclo ?? 0) + (profile?.creditos_pack ?? 0);

  const { data: analyses, error: analysesError } = await supabase
    .from("analyses")
    .select("id, producto, pais, score, veredicto, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (analysesError) {
    console.error("[dashboard] error cargando análisis:", analysesError.message);
  }

  const list = (analyses ?? []) as Pick<
    AnalysisRow,
    "id" | "producto" | "pais" | "score" | "veredicto" | "created_at"
  >[];

  // Las stats se calculan sobre TODOS los analisis, no sobre `list`. `list`
  // esta limitada a 20 y DashboardList pagina mas alla de eso, asi que a
  // partir del analisis 21 "mejor score" y "productos viables" pasaban a
  // significar en silencio "de los 20 mas recientes".
  //
  // `mejor` ademas trae producto e id: antes era un numero pelado, y cuando el
  // mejor analisis quedaba varios scrolls abajo en el listado (el 80 de la
  // cuenta de prueba esta en la posicion 11 de 14) la stat se leia como si
  // contradijera lo que se ve en pantalla. El numero era correcto; lo que
  // faltaba era decir a que analisis pertenece y poder ir a el.
  const { data: mejorData } = await supabase
    .from("analyses")
    .select("id, producto, score")
    .eq("user_id", user.id)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: viables } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("veredicto", "VIABLE");

  const { count: totalAnalisisCount } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const mejor = mejorData ?? null;
  const mejorScore = mejor?.score ?? 0;
  const totalViables = viables ?? 0;
  const totalAnalisis = totalAnalisisCount ?? 0;

  return (
    <>
      <Suspense fallback={null}>
        <PixelRegistration />
      </Suspense>
      <Navbar
        email={profile?.email ?? user.email}
        analisisRestantes={analisisRestantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0A0A0A]">
              Tus análisis
            </h1>
            {/* Los creditos restantes viven solo en el Navbar. Estaban aca, en
                el Navbar y en el tercer tile a la vez: el mismo numero tres
                veces en la misma pantalla. */}
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-xs capitalize">
                Plan {profile?.plan ?? "free"}
              </Badge>
            </div>
          </div>
          <Link href="/analizar">
            <Button size="lg" className="rounded-md">
              + Nuevo análisis
            </Button>
          </Link>
        </div>

        {/* Banner reverse trial para Free con crédito disponible */}
        {profile?.plan === "free" && analisisRestantes > 0 && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-center justify-between mb-4 mt-6">
            <div>
              <p className="text-sm font-semibold text-green-800">🎁 Tu primer análisis es completamente gratis</p>
              <p className="text-xs text-gray-600 mt-0.5">Vas a ver el análisis completo — sin restricciones.</p>
            </div>
            <Link href="/analizar">
              <Button size="sm" className="bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full whitespace-nowrap">
                Analizar ahora →
              </Button>
            </Link>
          </div>
        )}

        {sinCredito && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Ya usamos tu análisis gratis con este dispositivo o red. Para seguir
            validando productos, elegí un plan más abajo 👇
          </div>
        )}

        {analisisRestantes <= 0 && profile?.plan !== "pro" && (
          <div className="mt-6">
            <UpgradeBanner producto={list[0]?.producto} veredicto={list[0]?.veredicto} />
          </div>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6 mt-8">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
              <div className={`text-2xl font-bold ${totalViables > 0 ? 'text-[#16A34A]' : 'text-[#6B7280]'}`}>{totalViables}</div>
              <div className="text-xs text-[#6B7280] mt-1">
                {totalViables === 1 ? "producto viable" : "productos viables"}
              </div>
            </div>
            {/* El mejor score linkea a su analisis y dice cual es. */}
            {mejor && mejorScore > 0 ? (
              <Link
                href={`/resultado/${mejor.id}`}
                className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center transition-colors hover:border-[#0A0A0A]/20 hover:bg-[#F9FAFB]"
              >
                <div className="text-2xl font-bold text-[#0A0A0A]">{mejorScore}</div>
                <div className="text-xs text-[#6B7280] mt-1 truncate" title={mejor.producto}>
                  mejor score · {mejor.producto}
                </div>
              </Link>
            ) : (
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
                <div className="text-2xl font-bold text-[#0A0A0A]">—</div>
                <div className="text-xs text-[#6B7280] mt-1">mejor score</div>
              </div>
            )}
            {/* Tercer tile: antes repetia los creditos restantes, que ya estan
                en el Navbar Y en la linea de arriba del titulo — el mismo dato
                tres veces en una pantalla. Ahora muestra el total historico,
                que no esta en ningun otro lado. */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-2xl font-bold text-[#0A0A0A]">{totalAnalisis}</div>
              <div className="text-xs text-[#6B7280] mt-1">
                {totalAnalisis === 1 ? "análisis hecho" : "análisis hechos"}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <DashboardList initialList={list} userId={user.id} queryFailed={!!analysesError} />
        </div>
      </main>
    </>
  );
}
