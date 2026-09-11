import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { bootstrapNewUser } from "@/lib/new-user-bootstrap";

export const runtime = "nodejs";

/**
 * El login por OTP (Hallazgo 2) verifica el codigo enteramente del lado
 * cliente con supabase.auth.verifyOtp — nunca pasa por app/auth/callback.
 * Sin este endpoint, un usuario nuevo que entra por OTP nunca pasaria por el
 * anti-fraude de credito gratis ni por la atribucion UTM. El front lo llama
 * (con las cookies de sesion ya puestas por verifyOtp) antes de redirigir.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/dashboard";

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
  }

  const { error: upsertError } = await supabase
    .from("users")
    .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
  if (upsertError) {
    console.error("[api/auth/post-login] error en upsert de users:", upsertError.message);
  }

  const redirectUrl = new URL(`${origin}${safeNext}`);

  const { ranFirstTime, sinCredito } = await bootstrapNewUser(
    user,
    request.headers,
    request.cookies
  );
  if (ranFirstTime) {
    redirectUrl.searchParams.set("registered", "1");
    if (sinCredito) {
      redirectUrl.searchParams.set("sin_credito", "1");
    }
  }

  return NextResponse.json({ redirectTo: `${redirectUrl.pathname}${redirectUrl.search}` });
}
