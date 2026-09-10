"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSesionCliente } from "@/lib/useSesionCliente";

declare function fbq(...args: unknown[]): void;

function handleCtaClick() {
  if (typeof fbq !== "undefined") {
    fbq("track", "Lead");
  }
}

/**
 * Landing 100% estatica: este componente no recibe props de servidor, por lo
 * que `useSesionCliente()` arranca siempre en el estado anonimo (default
 * durante la hidratacion, el caso mayoritario de trafico de Meta Ads) y
 * reconcilia via el hook compartido con el Navbar si hay cookie de sesion.
 *
 * Los tres estados se renderizan siempre los tres, apilados en la misma
 * celda de grid (`col-start-1 row-start-1`) y solo uno visible por vez: asi
 * el contenedor mide lo que mide el mas alto de los tres y el swap post-
 * hidratacion no mueve el HeroMock de abajo.
 */
export function HeroSection() {
  const { clientEmail, analisisRestantes } = useSesionCliente();
  const isLoggedIn = clientEmail != null;
  const sinAnalisis = isLoggedIn && analisisRestantes <= 0;
  const conAnalisis = isLoggedIn && !sinAnalisis;

  return (
    <div className="mt-8 grid justify-items-center">
      {/* Anonimo — exactamente el hero de adquisicion de siempre */}
      <div
        className="col-start-1 row-start-1 flex flex-col items-center"
        style={{ visibility: isLoggedIn ? "hidden" : "visible" }}
        aria-hidden={isLoggedIn}
      >
        <Link href="/login" onClick={handleCtaClick}>
          <Button size="lg" className="rounded-md">
            Analizar mi producto gratis →
          </Button>
        </Link>
        <p className="mt-4 text-sm text-[#6B7280]">
          1 análisis gratis · Sin tarjeta de crédito
        </p>
      </div>

      {/* Logueado, con analisis disponibles este mes */}
      <div
        className="col-start-1 row-start-1 flex flex-col items-center"
        style={{ visibility: conAnalisis ? "visible" : "hidden" }}
        aria-hidden={!conAnalisis}
      >
        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          <Link href="/analizar">
            <Button size="lg" className="w-full sm:w-auto rounded-md">
              Nuevo análisis
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto rounded-md border-[#E5E7EB] text-[#0A0A0A]"
            >
              Ir al dashboard
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm text-[#6B7280]">
          Te quedan {analisisRestantes} análisis este mes
        </p>
      </div>

      {/* Logueado, sin analisis restantes este mes */}
      <div
        className="col-start-1 row-start-1 flex flex-col items-center"
        style={{ visibility: sinAnalisis ? "visible" : "hidden" }}
        aria-hidden={!sinAnalisis}
      >
        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          <Link href="/#planes">
            <Button size="lg" className="w-full sm:w-auto rounded-md">
              Ver planes
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto rounded-md border-[#E5E7EB] text-[#0A0A0A]"
            >
              Ir al dashboard
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm text-[#6B7280]">
          Usaste tu análisis de este mes
        </p>
      </div>
    </div>
  );
}
