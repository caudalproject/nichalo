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
export function MarcaVista({
  origen,
  evento = "vio_packs",
  children,
}: {
  origen: string;
  /** TAB 8: tambien marca "vio_proveedores" (bloque "Donde conseguirlo"). */
  evento?: "vio_packs" | "vio_proveedores";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const clave = `nichalo:${evento}:${origen}`;
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
          body: JSON.stringify({ evento, origen }),
          keepalive: true,
        }).catch(() => {});
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [origen, evento]);

  return <div ref={ref}>{children}</div>;
}
