import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/Navbar";
import { AnalizarForm } from "./AnalizarForm";

export const dynamic = "force-dynamic";

export default async function AnalizarPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/analizar");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("plan, analisis_restantes, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <Navbar
        email={user.email}
        analisisRestantes={profile?.analisis_restantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">Nuevo análisis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresá los datos básicos y te devolvemos un veredicto en segundos.
          </p>
          <div className="mt-6">
            <AnalizarForm
              creditsLeft={profile?.analisis_restantes ?? 0}
              plan={profile?.plan ?? "free"}
            />
          </div>
        </div>
      </main>
    </>
  );
}
