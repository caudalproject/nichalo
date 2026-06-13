import { NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: userData } = await adminSupabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (!userData || userData.plan === "free") {
    return NextResponse.json(
      { error: "El usuario no tiene suscripción activa" },
      { status: 400 }
    );
  }

  try {
    const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
    const preApproval = new PreApproval(mp);

    const externalRef = `${user.id}|${userData.plan}`;
    const searchResult = await preApproval.search({
      options: { external_reference: externalRef },
    });

    const activeSub = searchResult.results?.find(
      (s) => s.status === "authorized"
    );

    if (!activeSub?.id) {
      return NextResponse.json(
        { error: "No se encontró suscripción activa en Mercado Pago" },
        { status: 404 }
      );
    }

    await preApproval.update({
      id: activeSub.id,
      body: { status: "cancelled" },
    });

    await adminSupabase
      .from("users")
      .update({ plan: "free" })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cancelar] error:", err);
    return NextResponse.json({ error: "Error al cancelar suscripción" }, { status: 500 });
  }
}
