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
    .select("plan, creditos_ciclo, creditos_pack, email")
    .eq("id", user.id)
    .maybeSingle();

  const analisisRestantes = (profile?.creditos_ciclo ?? 0) + (profile?.creditos_pack ?? 0);

  // Solo se consulta si hace falta: sin créditos es cuando AnalizarForm
  // muestra la PacksOffer y le sirve el producto/veredicto del último
  // análisis para personalizarla.
  let ultimoAnalisis: { producto: string; veredicto: "VIABLE" | "MARGINAL" | "SATURADO" } | null = null;
  if (analisisRestantes <= 0) {
    const { data } = await supabase
      .from("analyses")
      .select("producto, veredicto")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimoAnalisis = data;
  }

  return (
    <>
      <Navbar
        email={user.email}
        analisisRestantes={analisisRestantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">Nuevo análisis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analizamos publicaciones reales de Mercado Libre y te decimos si vale la pena venderlo — antes de que inviertas un peso.
          </p>
          <div className="mt-6">
            <AnalizarForm
              creditsLeft={analisisRestantes}
              plan={profile?.plan ?? "free"}
              ultimoProducto={ultimoAnalisis?.producto}
              ultimoVeredicto={ultimoAnalisis?.veredicto}
            />
          </div>
        </div>
      </main>
    </>
  );
}
