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
import type { AnalysisRow, UserRow } from "@/lib/supabase";

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

        {(profile?.analisis_restantes ?? 0) <= 0 && profile?.plan !== "pro" && (
          <div className="mt-6">
            <UpgradeBanner />
          </div>
        )}

        <div className="mt-8">
          <DashboardList initialList={list} userId={user.id} queryFailed={!!analysesError} />
        </div>
      </main>
    </>
  );
}
