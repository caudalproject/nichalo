"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Magic link state
  const [email, setEmail] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);

  // Google bloquea OAuth desde WebViews embebidos (disallowed_useragent).
  // El navegador in-app de Facebook/Instagram en Android es un WebView, y de ahí
  // viene la mayor parte del trafico pago. Para esos usuarios "Continuar con
  // Google" es un camino sin salida: hay que empujarlos al magic link.
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setInAppBrowser(/FBAN|FBAV|FB_IAB|Instagram/i.test(ua));
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
    });
  }, []);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setMagicLoading(true);
    setMagicError(null);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });
    setMagicLoading(false);
    if (error) {
      setMagicError(error.message);
    } else {
      setMagicSent(true);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      console.error(error);
      setLoading(false);
    }
  }

  return (
    <main className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Ingresá a Nichalo</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Validá tu próximo producto en segundos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorParam === "cancelled" ? (
            <p className="text-sm text-amber-600">Cancelaste el inicio de sesión. Podés intentarlo de nuevo.</p>
          ) : errorParam ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              No pudimos iniciar sesión: {errorParam}
            </div>
          ) : null}
          {/* Magic link — metodo primario: es el unico que funciona en el
              navegador in-app de Meta, de donde viene casi todo el trafico */}
          {magicSent ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-center text-sm text-green-700">
              <p className="font-medium">Revisá tu email 📬</p>
              <p className="mt-1 text-xs text-green-600">
                Te mandamos un link. Tocalo y entrás directo, sin contraseña.
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-2">
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={magicLoading}
                autoComplete="email"
                inputMode="email"
                className="w-full"
              />
              {magicError && (
                <p className="text-xs text-destructive">{magicError}</p>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={magicLoading || !email.trim()}
              >
                {magicLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {magicLoading ? "Enviando…" : "Entrar con mi email"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Sin contraseña. Te llega un link y entrás.
              </p>
            </form>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">o</span>
            </div>
          </div>

          {/* Google — secundario. En WebView de Meta ni lo ofrecemos: Google
              rechaza el OAuth y el usuario queda trabado sin entender por que */}
          {inAppBrowser ? (
            <p className="text-center text-xs text-muted-foreground">
              ¿Preferís entrar con Google? Abrí{" "}
              <span className="font-medium">nichalo.com</span> en Chrome —
              desde acá dentro Google no permite el inicio de sesión.
            </p>
          ) : (
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg
                className="mr-2 h-4 w-4"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M21.35 11.1H12v3.2h5.35c-.23 1.42-1.7 4.15-5.35 4.15-3.22 0-5.85-2.66-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.05.78 3.75 1.45l2.55-2.45C16.95 4.05 14.7 3 12 3 6.95 3 2.85 7.1 2.85 12s4.1 9 9.15 9c5.27 0 8.75-3.7 8.75-8.9 0-.6-.05-1.05-.15-1.5Z"
                />
              </svg>
              {loading ? "Redirigiendo…" : "Continuar con Google"}
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Al continuar aceptás nuestros términos.{" "}
            <Link href="/" className="underline">
              Volver
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <div className="container py-20 text-center text-sm text-muted-foreground">
            Cargando…
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </>
  );
}
