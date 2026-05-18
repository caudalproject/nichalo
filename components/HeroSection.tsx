"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function HeroSection() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
    });
  }, []);

  if (loggedIn) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
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
    );
  }

  return (
    <>
      <div className="mt-8 flex justify-center">
        <Link href="/login">
          <Button size="lg" className="w-full sm:w-auto rounded-md">
            Empezar gratis
          </Button>
        </Link>
      </div>
      <p className="mt-4 text-sm text-[#6B7280]">
        1 análisis gratis · Sin tarjeta de crédito
      </p>
    </>
  );
}
