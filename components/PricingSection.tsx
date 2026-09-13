"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PricingCheckoutButton } from "@/components/PricingCheckoutButton";
import { PacksZone } from "@/components/PacksZone";
import { ComparisonTable } from "@/components/ComparisonTable";
import { MonedaPais } from "@/components/PreciosPais";
import { PlanRecommender, type PlanRecommendation } from "@/components/PlanRecommender";

export interface PricingCard {
  kind: "free" | "pro";
  name: string;
  price: ReactNode;
  period: string;
  priceNote: ReactNode;
  highlighted: boolean;
  badge: string | null;
  features: { label: string; included: boolean; subItems: string[] | null }[];
  cta: string;
  href: string | null;
  mpPlan: "pro" | null;
}

interface Props {
  cards: PricingCard[];
}

// Resultado público de ejemplo mostrado sin login (ver "trust line" abajo).
// Configurable por env var para poder rotarlo sin tocar código; fallback al
// análisis real vigente ("Termo Stanley", score 90) si la var no está seteada.
// El build falla si este ID no resuelve — ver scripts/check-featured-result.mjs.
const FEATURED_RESULT_ID =
  process.env.NEXT_PUBLIC_FEATURED_RESULT_ID || "6d43a024-af07-495a-9926-a2167fa12644";

// Ring de énfasis para la card que el recomendador (arriba) señala. No
// reemplaza el estilo propio de cada card (ej. el badge "Más completo" de
// Pro, o el resaltado permanente de Análisis en PacksZone) — se suma.
function ringClass(active: boolean): string {
  return active ? "ring-2 ring-[#16A34A] ring-offset-2 rounded-lg" : "";
}

export function PricingSection({ cards }: Props) {
  const [selected, setSelected] = useState<PlanRecommendation | null>(null);
  const free = cards[0];
  const pro = cards[1];

  return (
    <section id="planes" className="bg-[#F9FAFB] py-20 border-y border-[#E5E7EB]">
      <div className="container">
        <h2 className="text-center text-3xl font-bold text-[#0A0A0A]">
          Planes
        </h2>
        <p className="mt-3 text-center text-[#6B7280]">
          Un análisis cuesta menos del 1% del stock que estás por comprar.
        </p>
        <p className="mt-1 text-center text-sm text-[#6B7280]">
          Precios en <MonedaPais />
        </p>

        <PlanRecommender selected={selected} onSelect={setSelected} />

        <div className="mt-8 mx-auto grid max-w-5xl gap-6 grid-cols-1 md:grid-cols-3 items-start">
          {/* Free */}
          <div key={free.name} className={`relative h-full ${ringClass(selected === "uno")}`}>
            <Card className="h-full rounded-lg border-[#E5E7EB]">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-[#0A0A0A]">
                  {free.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#0A0A0A]">
                    {free.price}
                  </span>
                  <span className="text-[#6B7280] text-sm">
                    {free.period}
                  </span>
                </div>
                <ul className="mt-6 space-y-3">
                  {free.features.map((feat) => (
                    <li key={feat.label} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-[#16A34A] mt-0.5 shrink-0" />
                      <span className="text-[#0A0A0A]">{feat.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link href={free.href!} className="block">
                    <Button className="w-full rounded-md" variant="outline">
                      {free.cta}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Análisis (Pack 3 / Pack 10) — la única card destacada por default */}
          <div className={ringClass(selected === "dos_tres")}>
            <PacksZone />
          </div>

          {/* Pro — subordinada, sin border verde */}
          <div key={pro.name} className={`relative h-full ${ringClass(selected === "muchos")}`}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
              <span className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap text-white bg-[#16A34A]">
                {pro.badge}
              </span>
            </div>
            <Card className="h-full rounded-lg border-[#E5E7EB]">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-[#0A0A0A]">
                  {pro.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#0A0A0A]">
                    {pro.price}
                  </span>
                  <span className="text-[#6B7280] text-sm">
                    {pro.period}
                  </span>
                </div>
                {pro.priceNote && (
                  <p className="mt-1 text-xs text-[#6B7280]">{pro.priceNote}</p>
                )}
                <ul className="mt-6 space-y-3">
                  {pro.features.map((feat) => (
                    <li key={feat.label} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-[#16A34A] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[#0A0A0A]">{feat.label}</span>
                        {feat.subItems && (
                          <ul className="mt-1.5 space-y-1">
                            {feat.subItems.map((sub) => (
                              <li key={sub} className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                                <span className="text-[#16A34A] font-bold leading-none">·</span>
                                {sub}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <PricingCheckoutButton
                    plan={pro.mpPlan!}
                    variant="default"
                    label={pro.cta}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Confianza + prueba social (punto 9 del brief) */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-sm text-[#6B7280]">
            Pagás con Mercado Pago · Sin suscripción · Sin renovación automática
          </p>
          <p className="text-sm">
            <a
              href={`/resultado/${FEATURED_RESULT_ID}`}
              className="text-[#16A34A] hover:underline font-medium"
            >
              Mirá un análisis completo, sin registrarte →
            </a>
          </p>
        </div>

        {/* Comparison table */}
        <ComparisonTable />

        <p className="mt-8 text-center text-sm text-[#6B7280]">
          Sin contratos. Cancelá cuando quieras.
        </p>
      </div>
    </section>
  );
}
