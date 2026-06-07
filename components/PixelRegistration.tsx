"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function PixelRegistration() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("registered") !== "1") return;

    if (typeof window.fbq === "function") {
      window.fbq("track", "CompleteRegistration");
    }

    // Limpiar el param de la URL sin recargar
    const url = new URL(window.location.href);
    url.searchParams.delete("registered");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  }, [searchParams, router]);

  return null;
}
