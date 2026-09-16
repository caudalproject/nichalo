"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, X } from "lucide-react";
import { useSesionCliente } from "@/lib/useSesionCliente";
import { LandingAnchors } from "@/components/LandingAnchors";

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // El SDK de Supabase, `auth.getUser()` y el query a
  // `users(plan, creditos_ciclo, creditos_pack)` viven en un hook compartido
  // con HeroSection: en la landing (sin props de servidor) ambos componentes
  // se suscriben al mismo fetch en vez de dispararlo dos veces.
  const sesion = useSesionCliente({ email, plan, analisisRestantes });
  const clientEmail = sesion.clientEmail;
  const clientName = sesion.clientName;

  // Cancelar la suscripcion cambia el plan sin pasar por un nuevo login: se
  // guarda como override local por encima de lo que devuelva el hook. Solo
  // se pisa `plan` — los creditos que queden (creditos_pack, que no se
  // toca al cancelar) los sabe el servidor, no este componente, y llegan
  // solos con el `router.refresh()` de abajo.
  const [overrideTrasCancelar, setOverrideTrasCancelar] = useState<{
    plan: string;
  } | null>(null);
  const userData = overrideTrasCancelar
    ? {
        plan: overrideTrasCancelar.plan,
        analisisRestantes: sesion.analisisRestantes,
      }
    : { plan: sesion.plan, analisisRestantes: sesion.analisisRestantes };

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
  const analisis = userData.analisisRestantes;
  const nombre = clientName ?? clientEmail ?? "";
  const nombreCorto = clientName
    ? clientName.split(" ")[0]
    : (clientEmail?.split("@")[0] ?? "");
  const inicial = (nombre[0] ?? "?").toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase");
      const supabase = createSupabaseBrowserClient();
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
      setOverrideTrasCancelar({ plan: "free" });
      setShowCancelConfirm(false);
      router.refresh();
    } finally {
      setCanceling(false);
    }
  }

  return (
    <>
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-30">
        <div className="container flex h-14 items-center justify-between gap-4">
          {/* Grupo izquierdo: marca + navegacion. Ver el comentario de
              LandingAnchors sobre por que las anclas van aca y no pegadas al
              boton de la derecha. */}
          <div className="flex items-center gap-5 md:gap-8">
            <Link
              href="/"
              className="font-semibold text-xl tracking-tight select-none shrink-0"
            >
              <span className="text-[#16A34A]">N</span>
              <span className="text-[#0A0A0A]">ichalo</span>
            </Link>
            {!clientEmail && <LandingAnchors />}
          </div>

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
              <>
                {/* Las anclas de la landing viven en el grupo izquierdo,
                    junto al logo. Aca queda solo la accion. */}
                <Link href="/login">
                  <Button size="sm">Ingresar</Button>
                </Link>
              </>
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
