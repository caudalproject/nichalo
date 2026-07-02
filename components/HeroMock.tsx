"use client";

import { useEffect, useRef } from "react";

declare function fbq(...args: unknown[]): void;

export function HeroMock() {
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
              VIABLE
            </span>
            <span className="text-xs text-gray-400">Mercado con oportunidad real</span>
          </div>

          {/* Score */}
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-5xl font-black leading-none text-green-500">78</span>
            <span className="text-lg text-gray-300 font-light">/100</span>
          </div>

          {/* Producto */}
          <p className="text-sm font-semibold text-gray-900 mb-0.5">
            Cargador inalámbrico 15W para auto
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Argentina · Costo $8.500 · 45 publicaciones analizadas
          </p>

          {/* Métricas — solo 2 para mobile */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: "Ganancia por unidad", value: "+$4.200", green: true },
              { label: "Margen bruto", value: "+18.4%", green: true },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center"
              >
                <div className="text-xs text-gray-500 leading-tight">{m.label}</div>
                <div className="mt-1 text-base font-bold text-green-600">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Resumen */}
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Resumen
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">
              Mercado con demanda sostenida y pocos vendedores consolidados. Tu costo
              te permite competir en precio con margen saludable.
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer demo */}
      <p className="mt-2 text-center text-xs text-gray-400">
        Ejemplo real de análisis — datos de Mercado Libre
      </p>
    </div>
  );
}
