import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sendWelcomeEmail } from "@/lib/resend";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=missing_env`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

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
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .single();

    const isNewUser = !existingUser;

    await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email }, { onConflict: "id" });

    if (isNewUser && user.email) {
      const nombre =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email.split("@")[0];
      await sendWelcomeEmail(user.email, nombre);

      // Señalizar al cliente para disparar el evento de píxel
      const newUserUrl = new URL(response.headers.get("location") ?? `${origin}${next}`);
      newUserUrl.searchParams.set("registered", "1");
      return NextResponse.redirect(newUserUrl.toString(), { headers: response.headers });
    }
  }

  return response;
}
