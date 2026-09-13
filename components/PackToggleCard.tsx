"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PackCheckoutButton } from "@/components/PackCheckoutButton";

// Pack 3 y Pack 10 no son dos planes, son un producto con una cantidad.
// Un solo toggle en vez de dos columnas evita que el usuario tenga que
// resolver "¿cuántos necesito?" antes de haber decidido "¿compro?"
// (ver Negocios/Nichalo/AI-Sessions/2026-09-12-brief-rediseno-precios).
const PACKS = {
  pack_3: {
    label: "3",
    pack: "pack_3" as const,
    precio: "$4.500",
    porAnalisis: "$1.500 por análisis",
    analisis: "3 productos que no comprás a ciegas",
    cta: "Comprar Pack 3",
  },
  pack_10: {
    label: "10",
    pack: "pack_10" as const,
    precio: "$12.000",
    porAnalisis: "$1.200 por análisis",
    analisis: "10 productos que no comprás a ciegas",
    cta: "Comprar Pack 10",
  },
} as const;

const FEATURES_FIJAS = [
  "Hasta 50 publicaciones reales de tu competencia por análisis — no una estimación",
  "Veredicto: VIABLE, MARGINAL o SATURADO, con el razonamiento",
];

export function PackToggleCard() {
  const [selected, setSelected] = useState<keyof typeof PACKS>("pack_3");
  const pack = PACKS[selected];

  return (
    <div className="relative h-full">
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
        <span className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap text-white bg-[#16A34A]">
          Mejor precio por análisis
        </span>
      </div>
      <Card className="h-full rounded-lg border-2 border-[#16A34A] shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-[#0A0A0A]">Análisis</h3>
          <p className="mt-1 text-sm font-semibold text-[#16A34A]">
            Pagás una vez. Los créditos no vencen. No hay nada que cancelar.
          </p>

          <div className="mt-4 inline-flex rounded-md border border-[#E5E7EB] p-0.5 bg-[#F9FAFB]">
            {(Object.keys(PACKS) as Array<keyof typeof PACKS>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={selected === key}
                className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                  selected === key
                    ? "bg-[#16A34A] text-white"
                    : "text-[#6B7280] hover:text-[#0A0A0A]"
                }`}
              >
                {PACKS[key].label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-[#0A0A0A]">{pack.precio}</span>
            <span className="text-[#6B7280] text-sm">pago único</span>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">{pack.porAnalisis}</p>

          <ul className="mt-6 space-y-3">
            {[pack.analisis, ...FEATURES_FIJAS].map(
              (label) => (
                <li key={label} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 text-[#16A34A] mt-0.5 shrink-0" />
                  <span className="text-[#0A0A0A]">{label}</span>
                </li>
              )
            )}
          </ul>

          <div className="mt-8">
            <PackCheckoutButton pack={pack.pack} variant="default" label={pack.cta} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
