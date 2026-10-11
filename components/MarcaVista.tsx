"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Registra "vio_packs" cuando la oferta ENTRA EN PANTALLA, no cuando se
 * renderiza (TAB 3.8). En /resultado la oferta esta al fondo, a ~4.900 px en
 * mobile: renderizada no prueba que alguien la vio.
 *
 * Una vez por pestaña (sessionStorage) para no repetir el POST; la base igual
 * deduplica por usuario + origen.
 */
export function MarcaVista({ origen, children }: { origen: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const clave = `nichalo:vio_packs:${origen}`;
    if (!el || typeof IntersectionObserver === "undefined") return;
    try {
      if (sessionStorage.getItem(clave)) return;
    } catch {}

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        try {
          sessionStorage.setItem(clave, "1");
        } catch {}
        fetch("/api/eventos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evento: "vio_packs", origen }),
          keepalive: true,
        }).catch(() => {});
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [origen]);

  return <div ref={ref}>{children}</div>;
}
