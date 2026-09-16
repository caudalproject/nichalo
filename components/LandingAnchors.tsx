"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anclas de navegacion de la landing (auditoria 13/9, problema 2: la navbar
 * era solo logo + "Ingresar", y para llegar al precio habia que recorrer ~7
 * scrolls).
 *
 * Por que viven pegadas al logo y no al lado del boton: en la primera version
 * estaban a la derecha, apretadas contra "Ingresar". Eso hace dos cosas malas
 * a la vez — compiten con el CTA por la misma zona de la pantalla, y en un
 * monitor ancho quedan flotando al borde con todo el centro vacio, que es
 * justo lo que se veia "colgado". El patron estandar (Stripe, Linear, Vercel,
 * Notion) agrupa marca + navegacion a la izquierda y deja el CTA solo a la
 * derecha, para que el ojo lea "esto es el sitio" / "esto es la accion".
 *
 * El indicador de seccion activa es lo que las hace sentir navegacion de
 * producto y no tres links sueltos: mientras se scrollea, la seccion en la que
 * estas queda marcada. Se calcula con IntersectionObserver, sin listener de
 * scroll.
 */

const ANCHORS = [
  { id: "como-funciona", label: "Cómo funciona", soloDesktop: true },
  { id: "ejemplo", label: "Ejemplo", soloDesktop: true },
  { id: "planes", label: "Planes", soloDesktop: false },
] as const;

export function LandingAnchors() {
  const [activo, setActivo] = useState<string | null>(null);
  // Set de ids visibles en este momento. El callback del observer solo entrega
  // las entradas que CAMBIARON, no todas, asi que hay que acumular el estado.
  const visibles = useRef<Set<string>>(new Set());

  useEffect(() => {
    const els = ANCHORS.map((a) => document.getElementById(a.id)).filter(
      (el): el is HTMLElement => el != null
    );
    // Fuera de la landing (login, por ejemplo) no hay secciones que observar:
    // los links siguen funcionando como navegacion a "/#ancla", sin indicador.
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visibles.current.add(e.target.id);
          else visibles.current.delete(e.target.id);
        }
        // De las visibles, la que aparece primero en el orden del documento.
        const siguiente =
          ANCHORS.find((a) => visibles.current.has(a.id))?.id ?? null;
        setActivo(siguiente);
      },
      {
        // -56px arriba = alto del header sticky (h-14). -55% abajo: una seccion
        // cuenta como "activa" cuando su tope entro en la mitad superior de la
        // pantalla, no apenas asoma desde abajo.
        rootMargin: "-56px 0px -55% 0px",
        threshold: 0,
      }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="flex items-center gap-5 md:gap-7 text-sm">
      {ANCHORS.map((a) => {
        const esActivo = activo === a.id;
        return (
          <a
            key={a.id}
            href={`/#${a.id}`}
            aria-current={esActivo ? "true" : undefined}
            className={`relative py-4 transition-colors ${
              a.soloDesktop ? "hidden sm:inline-block" : ""
            } ${
              esActivo
                ? "text-[#0A0A0A] font-medium"
                : "text-[#6B7280] hover:text-[#0A0A0A]"
            }`}
          >
            {a.label}
            {/* Subrayado de seccion activa. Se renderiza siempre y se escala en
                X para que el ancho del link no cambie al activarse — si no, la
                navbar entera se corre unos pixeles al scrollear. */}
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#16A34A] transition-transform duration-200 ${
                esActivo ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </a>
        );
      })}
    </nav>
  );
}
