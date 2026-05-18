"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const [loading, setLoading] = useState(false);

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
          {errorParam && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              No pudimos iniciar sesión: {errorParam}
            </div>
          )}
          <Button
            className="w-full"
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
