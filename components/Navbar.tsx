"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavbarProps {
  email?: string | null;
  analisisRestantes?: number;
  plan?: string;
}

export function Navbar({ email, analisisRestantes, plan }: NavbarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clientEmail, setClientEmail] = useState<string | null>(email ?? null);

  useEffect(() => {
    if (clientEmail) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setClientEmail(data.user?.email ?? null));
  }, [clientEmail]);

  async function handleLogout() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-[#E5E7EB] bg-white/80 backdrop-blur sticky top-0 z-30">
      <div className="container flex h-14 items-center justify-between">
        <Link
          href="/"
          className="font-semibold text-xl tracking-tight select-none"
        >
          <span className="text-[#16A34A]">N</span>
          <span className="text-[#0A0A0A]">ichalo</span>
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {clientEmail ? (
            <>
              <Link
                href="/dashboard"
                className="text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/analizar"
                className="text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
              >
                Nuevo análisis
              </Link>
              {typeof analisisRestantes === "number" && (
                <Badge variant="secondary" className="text-xs">
                  {analisisRestantes} · {plan ?? "free"}
                </Badge>
              )}
              <span className="hidden sm:inline text-[#6B7280] text-xs">
                {clientEmail}
              </span>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                disabled={loading}
                className="border-[#E5E7EB]"
              >
                {loading ? "Saliendo…" : "Salir"}
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Ingresar</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
