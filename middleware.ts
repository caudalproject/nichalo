import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { PAIS_COOKIE, normalizarPais } from "@/lib/geolocation";

const PROTECTED_PREFIXES = ["/dashboard", "/analizar"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[middleware] faltan env vars de Supabase — redirigiendo a login");
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // getSession() lee el JWT del cookie localmente — sin network call a Supabase.
  // Es suficiente para decisiones de routing. Las páginas sensibles validan con
  // getUser() por su cuenta.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;

  // NO redirigir "/" para usuarios logueados: /planes redirige al anchor #planes
  // de la landing, así que sacar al usuario de "/" le corta el acceso al pricing
  // y por lo tanto el upgrade path. La landing se sirve igual para todos.

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Deteccion de pais en el edge. Antes vivia en la landing via headers(), lo
  // que forzaba render dinamico de "/" en cada visita solo para los precios,
  // que estan muy abajo en la pagina. Ahora el pais viaja en una cookie legible
  // por el cliente y la landing se sirve prerenderizada.
  const pais = normalizarPais(
    request.headers.get("x-vercel-ip-country") ??
      request.headers.get("cf-ipcountry") ??
      request.geo?.country
  );

  if (request.cookies.get(PAIS_COOKIE)?.value !== pais) {
    response.cookies.set({
      name: PAIS_COOKIE,
      value: pais,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // lo lee el componente de precios en el browser
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon, public
     * - API routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
