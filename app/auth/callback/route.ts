import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { bootstrapNewUser } from "@/lib/new-user-bootstrap";

export const runtime = "nodejs";

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
    const { error: upsertError } = await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
    if (upsertError) {
      console.error("[auth/callback] error en upsert de users:", upsertError.message);
    }

    const { ranFirstTime, sinCredito } = await bootstrapNewUser(
      user,
      request.headers,
      request.cookies
    );

    if (ranFirstTime) {
      // Señalizar al cliente para disparar el evento de píxel (y, si aplica,
      // mostrar el mensaje de "ya usaste tu analisis gratis" en el dashboard).
      const newUserUrl = new URL(`${origin}${safeNext}`);
      newUserUrl.searchParams.set("registered", "1");
      if (sinCredito) {
        newUserUrl.searchParams.set("sin_credito", "1");
      }
      response.headers.set("location", newUserUrl.toString());
      return response;
    }
  }

  return response;
}
