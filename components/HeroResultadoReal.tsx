"use client";

import { useEffect, useRef } from "react";
import { EJEMPLO_LANDING } from "@/lib/ejemplo-landing";

declare function fbq(...args: unknown[]): void;

/**
 * La card del hero. Muestra el informe de ejemplo — ver lib/ejemplo-landing.ts.
 *
 * Las dos metricas elegidas son las dos que se leen como dato y no como
 * promesa: cuantas publicaciones se analizaron y a que precio promedio estan.
 * El margen NO va aca a proposito — es un numero derivado y en el hero se lee
 * como inflado. Aparece una sola vez, mas abajo, en EjemploReal, con el costo
 * al lado para que se pueda sumar.
 */
export function HeroResultadoReal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (typeof fbq !== "undefined") {
            fbq("track", "ViewContent");
          }
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-8 mx-auto max-w-sm text-left">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
        {/* Barra verde superior */}
        <div className="h-1.5 w-full bg-green-500" />

        <div className="px-4 py-4">
          {/* Badge + label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">
              {EJEMPLO_LANDING.veredicto}
            </span>
            <span className="text-xs text-gray-400">Mercado con oportunidad real</span>
          </div>

          {/* Score */}
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-5xl font-black leading-none text-green-500">
              {EJEMPLO_LANDING.score}
            </span>
            <span className="text-lg text-gray-300 font-light">/100</span>
          </div>

          {/* Producto */}
          <p className="text-sm font-semibold text-gray-900 mb-0.5">
            {EJEMPLO_LANDING.producto}
          </p>
          {/* Sin repetir las publicaciones: el numero ya esta en la metrica
              de abajo. Tenerlo dos veces a un centimetro de distancia es la
              misma metrica duplicada que la auditoria marco en el dashboard
              ("27 analisis restantes" junto a "3/30 usados"). */}
          <p className="text-xs text-gray-400 mb-3">{EJEMPLO_LANDING.pais}</p>

          {/* Metricas — las dos verificables (ver comentario arriba) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center">
              <div className="text-xs text-gray-500 leading-tight">
                Publicaciones analizadas
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">
                {EJEMPLO_LANDING.publicacionesAnalizadas}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center">
              <div className="text-xs text-gray-500 leading-tight">
                Precio promedio del mercado
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">
                {EJEMPLO_LANDING.precioPromedio}
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Resumen
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">
              {EJEMPLO_LANDING.resumen}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-gray-400">
        Informe de ejemplo — mismo formato que el tuyo
      </p>
    </div>
  );
}
