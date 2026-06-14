import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardList } from "@/components/DashboardList";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { PixelRegistration } from "@/components/PixelRegistration";
import type { AnalysisRow, UserRow, Plan } from "@/lib/supabase";
import { PLAN_CONFIG } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  let profile: Pick<UserRow, "plan" | "analisis_restantes" | "email"> | null =
    null;
  const { data: profileData } = await supabase
    .from("users")
    .select("plan, analisis_restantes, email")
    .eq("id", user.id)
    .maybeSingle();
  profile = profileData;

  if (!profile) {
    profile = { plan: "free", analisis_restantes: 1, email: user.email ?? "" };
  }

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

  const viables = list.filter(a => a.veredicto === "VIABLE").length;
  const mejorScore = list.length > 0 ? Math.max(...list.map(a => a.score ?? 0)) : 0;
  const totalPlan = PLAN_CONFIG[profile?.plan as Plan]?.analisisPorMes ?? 1;
  const totalUsados = totalPlan - (profile?.analisis_restantes ?? 0);

  return (
    <>
      <Suspense fallback={null}>
        <PixelRegistration />
      </Suspense>
      <Navbar
        email={profile?.email ?? user.email}
        analisisRestantes={profile?.analisis_restantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0A0A0A]">
              Tus análisis
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-xs capitalize">
                Plan {profile?.plan ?? "free"}
              </Badge>
              <span className="text-sm text-[#6B7280]">
                <strong className="text-[#0A0A0A]">
                  {profile?.analisis_restantes ?? 0}
                </strong>{" "}
                análisis restantes
              </span>
            </div>
          </div>
          <Link href="/analizar">
            <Button size="lg" className="rounded-md">
              + Nuevo análisis
            </Button>
          </Link>
        </div>

        {/* Banner reverse trial para Free con crédito disponible */}
        {profile?.plan === "free" && (profile?.analisis_restantes ?? 0) > 0 && (
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

        {(profile?.analisis_restantes ?? 0) <= 0 && profile?.plan !== "pro" && (
          <div className="mt-6">
            <UpgradeBanner />
          </div>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6 mt-8">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-2xl font-bold text-[#16A34A]">{viables}</div>
              <div className="text-xs text-[#6B7280] mt-1">productos viables</div>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-2xl font-bold text-[#0A0A0A]">{mejorScore > 0 ? mejorScore : "—"}</div>
              <div className="text-xs text-[#6B7280] mt-1">mejor score</div>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-2xl font-bold text-[#0A0A0A]">{Math.max(0, totalUsados)}/{totalPlan}</div>
              <div className="text-xs text-[#6B7280] mt-1">análisis usados</div>
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
