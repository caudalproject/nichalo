"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, X } from "lucide-react";

type SupabaseBrowser = ReturnType<
  typeof import("@/lib/supabase")["createSupabaseBrowserClient"]
>;

// El SDK de Supabase pesa ~85 kB y antes entraba en el First Load JS de toda
// pagina que monta el Navbar — incluida la landing estatica, que la ve trafico
// anonimo de Meta Ads en Android. Se carga bajo demanda y una sola vez.
let supabasePromise: Promise<SupabaseBrowser> | null = null;

function getSupabase(): Promise<SupabaseBrowser> {
  if (!supabasePromise) {
    supabasePromise = import("@/lib/supabase").then((m) =>
      m.createSupabaseBrowserClient()
    );
  }
  return supabasePromise;
}

/**
 * Hay cookie de sesion de Supabase? Evita bajar el SDK para el visitante
 * anonimo, que es el caso comun en la landing. Supabase parte el token en
 * `sb-<ref>-auth-token.0`, `.1`, ... cuando no entra en una cookie.
 */
function haySesionEnCookies(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(document.cookie);
}

interface NavbarProps {
  email?: string | null;
  analisisRestantes?: number;
  plan?: string;
}

export function Navbar({ email, analisisRestantes, plan }: NavbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clientEmail, setClientEmail] = useState<string | null>(email ?? null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [userData, setUserData] = useState({
    email: email ?? null,
    plan: plan ?? "free",
    analisis_restantes: analisisRestantes ?? 0,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // El Navbar hidrata su propia sesion. Las paginas que ya la resolvieron en el
  // servidor (dashboard, analizar, resultado) siguen pasando props y solo se
  // usan como valor inicial; la landing estatica no pasa ninguna.
  const tieneDatosDeServidor = email != null;

  useEffect(() => {
    if (!haySesionEnCookies()) return;

    let cancelado = false;

    (async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getUser();
      const u = data.user;
      if (cancelado || error || !u) return;

      setClientEmail(u.email ?? null);
      setClientName(
        u.user_metadata?.full_name ?? u.user_metadata?.name ?? null
      );

      if (tieneDatosDeServidor) return;

      const { data: perfil } = await supabase
        .from("users")
        .select("plan, analisis_restantes")
        .eq("id", u.id)
        .maybeSingle();

      if (cancelado || !perfil) return;
      setUserData({
        email: u.email ?? null,
        plan: perfil.plan ?? "free",
        analisis_restantes: perfil.analisis_restantes ?? 0,
      });
    })().catch((err) => {
      console.error("[navbar] error hidratando sesion:", err);
    });

    return () => {
      cancelado = true;
    };
  }, [tieneDatosDeServidor]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const planActual = userData.plan;
  const analisis = userData.analisis_restantes;
  const nombre = clientName ?? clientEmail ?? "";
  const nombreCorto = clientName
    ? clientName.split(" ")[0]
    : (clientEmail?.split("@")[0] ?? "");
  const inicial = (nombre[0] ?? "?").toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[navbar] error cerrando sesion:", err);
    }
    window.location.href = "/";
  }

  async function handleCancelar() {
    if (canceling) return;
    setCanceling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/pagos/cancelar", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCancelError(data.error ?? "Error al cancelar. Intentá de nuevo.");
        return;
      }
      setUserData(prev => ({ ...prev, plan: "free", analisis_restantes: 1 }));
      setShowCancelConfirm(false);
      router.refresh();
    } finally {
      setCanceling(false);
    }
  }

  return (
    <>
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-30">
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
                  className="hidden md:inline text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/analizar"
                  className="hidden md:inline text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
                >
                  Nuevo análisis
                </Link>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-1 text-gray-600 hover:text-gray-900 transition-colors"
                  aria-label="Menú"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setOpen(!open)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-medium text-sm">
                      {inicial}
                    </div>
                    <span className="hidden md:block">{nombreCorto}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {open && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-100 shadow-lg z-50 py-2">
                      <div className="px-4 py-3 border-b border-gray-50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                            {nombre}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              planActual === "pro"
                                ? "bg-green-50 text-green-700"
                                : planActual === "starter"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {planActual === "pro"
                              ? "Pro"
                              : planActual === "starter"
                                ? "Starter"
                                : "Free"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {analisis} análisis restantes
                        </p>
                      </div>

                      <div className="py-1">
                        {(planActual === "free" || planActual === "starter") && (
                          <a
                            href="/#planes"
                            className="block px-3 py-2 text-xs font-semibold text-[#16A34A] hover:bg-green-50 rounded-md transition-colors"
                            onClick={() => setOpen(false)}
                          >
                            ⬆️ Mejorar plan →
                          </a>
                        )}

                        {planActual !== "free" && (
                          <>
                            {!showCancelConfirm ? (
                              <button
                                onClick={() => setShowCancelConfirm(true)}
                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              >
                                Cancelar suscripción
                              </button>
                            ) : (
                              <div className="px-3 py-2 space-y-2">
                                <p className="text-xs text-gray-600">¿Confirmás que querés cancelar? Perdés acceso al plan pago.</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setShowCancelConfirm(false)}
                                    className="flex-1 text-xs py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    No, quedarse
                                  </button>
                                  <button
                                    onClick={handleCancelar}
                                    disabled={canceling}
                                    className="flex-1 text-xs py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {canceling ? "Cancelando..." : "Sí, cancelar"}
                                  </button>
                                </div>
                              </div>
                            )}
                            {cancelError && (
                              <p className="px-3 text-xs text-red-600">{cancelError}</p>
                            )}
                          </>
                        )}

                        <button
                          onClick={handleSignOut}
                          disabled={signingOut}
                          className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link href="/login">
                <Button size="sm">Ingresar</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {clientEmail && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/35 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-0 top-14 z-50 md:hidden">
            <div className="mx-3 mt-2 bg-white rounded-xl shadow-lg overflow-hidden">
              <Link
                href="/dashboard"
                className="block px-5 py-4 text-sm text-[#6B7280] hover:text-[#0A0A0A] hover:bg-gray-50 border-b border-gray-100 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                href="/analizar"
                className="block px-5 py-4 text-sm text-[#6B7280] hover:text-[#0A0A0A] hover:bg-gray-50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Nuevo análisis
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
