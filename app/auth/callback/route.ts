import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sendWelcomeEmail } from "@/lib/resend";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validar que next sea una ruta interna
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/dashboard";

  const oauthError = searchParams.get("error");
  if (!code) {
    const errorMsg = oauthError === "access_denied" ? "cancelled" : "missing_code";
    return NextResponse.redirect(`${origin}/login?error=${errorMsg}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=missing_env`);
  }

  const response = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Ensure a row exists in the public.users table so the rest of the app can
  // rely on it. The SQL trigger does this server-side too, but doing it here
  // makes local dev resilient if the trigger wasn't installed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Usuario nuevo = creado hace menos de 10 segundos
    const createdAt = new Date(user.created_at).getTime();
    const now = Date.now();
    const isNewUser = now - createdAt < 10000;

    const { error: upsertError } = await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
    if (upsertError) {
      console.error("[auth/callback] error en upsert de users:", upsertError.message);
    }

    if (isNewUser && user.email) {
      const nombre =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email.split("@")[0];
      sendWelcomeEmail(user.email, nombre).catch((err) => {
        console.error("[auth/callback] error enviando welcome email:", err);
      });

      // Señalizar al cliente para disparar el evento de píxel
      const newUserUrl = new URL(response.headers.get("location") ?? `${origin}${safeNext}`);
      newUserUrl.searchParams.set("registered", "1");
      return NextResponse.redirect(newUserUrl.toString(), { headers: response.headers });
    }
  }

  return response;
}
