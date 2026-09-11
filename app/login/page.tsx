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

// Supabase no siempre manda 6 digitos — depende de la config del proyecto
// (este manda 8). En vez de asumir un largo fijo, se acepta un rango y se
// deja pasar lo que sea al verifyOtp, que es quien realmente lo valida.
const MIN_OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 8;

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // OTP state — codigo de 6 digitos en vez de magic link (Hallazgo 2: el
  // link se abre en OTRO navegador dentro de un WebView in-app y el usuario
  // termina logueado donde no estaba).
  const [email, setEmail] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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

  async function sendCode() {
    if (!email.trim()) return;
    setMagicLoading(true);
    setMagicError(null);
    const supabase = createSupabaseBrowserClient();
    // Sin emailRedirectTo: la plantilla de mail manda {{ .Token }}, un codigo
    // de 6 digitos, no un link — asi la sesion queda en el mismo navegador
    // donde el usuario empezo, aunque sea el WebView de TikTok/Instagram.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setMagicLoading(false);
    if (error) {
      setMagicError(error.message);
    } else {
      setMagicSent(true);
      setResendCooldown(60);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    await sendCode();
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < MIN_OTP_LENGTH) return;
    setOtpLoading(true);
    setOtpError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    if (error) {
      setOtpLoading(false);
      setOtpError(error.message);
      return;
    }

    // verifyOtp ya dejo la sesion en las cookies (createBrowserClient usa
    // @supabase/ssr) — este endpoint corre el bootstrap de usuario nuevo
    // (anti-fraude de credito + UTM) que en el flujo de Google corre
    // /auth/callback, y devuelve a donde redirigir.
    try {
      const res = await fetch(
        `/api/auth/post-login?next=${encodeURIComponent(redirect)}`
      );
      const data = await res.json();
      router.push(data.redirectTo ?? redirect);
    } catch {
      router.push(redirect);
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
          {/* Codigo por email — metodo primario: funciona en el navegador
              in-app de Meta/TikTok, de donde viene casi todo el trafico. Un
              magic link ahi abriria OTRO navegador y perderia la sesion. */}
          {magicSent ? (
            <form onSubmit={handleVerifyOtp} className="space-y-2">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center text-sm text-green-700">
                Te mandamos un código a <strong>{email.trim()}</strong>. Revisá spam.
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={MAX_OTP_LENGTH}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, MAX_OTP_LENGTH))
                }
                disabled={otpLoading}
                autoComplete="one-time-code"
                className="w-full text-center text-lg tracking-[0.5em]"
              />
              {otpError && <p className="text-xs text-destructive">{otpError}</p>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={otpLoading || otp.length < MIN_OTP_LENGTH}
              >
                {otpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {otpLoading ? "Verificando…" : "Confirmar código"}
              </Button>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    setMagicSent(false);
                    setOtp("");
                    setOtpError(null);
                  }}
                  className="underline"
                >
                  Usar otro email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || magicLoading}
                  className="underline disabled:no-underline disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : "Reenviar código"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSendCode} className="space-y-2">
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
                Sin contraseña. Te llega un código de 6 dígitos.
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
