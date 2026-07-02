"use client";

import { useEffect } from "react";

declare function fbq(...args: unknown[]): void;

export function PixelTracking() {
  useEffect(() => {
    let fired = false;

    function handleScroll() {
      if (fired) return;
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (scrolled / total >= 0.5) {
        fired = true;
        if (typeof fbq !== "undefined") {
          fbq("trackCustom", "ScrollDepth50");
        }
        window.removeEventListener("scroll", handleScroll);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return null;
}
