"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

declare function fbq(...args: unknown[]): void;

interface Props {
  isLoggedIn?: boolean;
}

export function HeroSection({ isLoggedIn = false }: Props) {
  function handleCtaClick() {
    if (typeof fbq !== "undefined") {
      fbq("track", "Lead");
    }
  }

  return (
    <>
      {isLoggedIn ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center">
          <Link href="/dashboard">
            <Button size="lg" className="w-full sm:w-auto rounded-md">
              Ir al dashboard
            </Button>
          </Link>
          <Link href="/analizar">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto rounded-md border-[#E5E7EB] text-[#0A0A0A]"
            >
              Nuevo análisis
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 flex justify-center">
            <Link href="/login" onClick={handleCtaClick}>
              <Button size="lg" className="rounded-md">
                Analizar mi producto gratis →
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-[#6B7280]">
            1 análisis gratis · Sin tarjeta de crédito
          </p>
        </>
      )}
    </>
  );
}
