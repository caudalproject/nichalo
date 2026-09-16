"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Reescrita en el rediseno del 14/9 (auditoria 13/9, problema 10).
//
// Se saco "¿Puedo cancelar en cualquier momento?": chocaba de frente con el
// argumento central de los packs ("pagas una vez, no hay nada que cancelar").
//
// Se saco "¿Que tan actualizados estan los datos?", que respondia "menos de
// 24 horas" — es falso: el cache de analisis tiene un TTL de 30 dias
// (app/api/analizar/route.ts:12) y es silencioso. La reemplaza "¿De donde
// salen los datos?", que responde lo que el visitante realmente pregunta sin
// prometer una frescura que el sistema no garantiza.
const FAQS = [
  {
    q: "¿En qué país funciona?",
    a: "Por ahora Nichalo funciona exclusivamente para Argentina (Mercado Libre Argentina). Próximamente estará disponible para México y Colombia.",
  },
  {
    q: "¿De dónde salen los datos?",
    a: "De las publicaciones activas de Mercado Libre Argentina, scrapeadas al correr el análisis. No son estimaciones ni promedios de industria: son los productos que están publicados y compitiendo con el tuyo, con sus precios reales.",
  },
  {
    q: "¿Necesito tener el producto en stock para analizarlo?",
    a: "No. Podés analizar cualquier producto antes de comprarlo para validar si vale la pena invertir. De hecho, ese es el momento en el que más sirve.",
  },
  {
    q: "¿Qué pasa si el análisis se equivoca?",
    a: "Nichalo no adivina el futuro: te muestra el mercado que hay hoy —cuántos venden lo mismo, a qué precio, qué margen te queda con tu costo— y un veredicto basado en eso. Es una herramienta para decidir con datos en vez de con intuición, no una garantía de venta. La decisión de comprar stock sigue siendo tuya.",
  },
  {
    q: "¿Puedo compartir el resultado?",
    a: "Sí. Cada análisis tiene un link público que podés mandarle a tu socio o a tu proveedor. Quien lo abra sin cuenta ve el veredicto, el score y los precios del mercado; para ver la competencia en detalle, los riesgos y la recomendación necesita una cuenta gratis.",
  },
  {
    q: "¿Qué incluye el plan Free?",
    a: "1 análisis gratis, por única vez (no se recarga todos los meses), con 30 publicaciones analizadas y el informe completo, sin restricciones y sin tarjeta. Es exactamente el mismo análisis que recibe alguien que paga — lo que comprás después es cantidad, no profundidad. Cuando lo uses, podés seguir validando con un pack de créditos o suscribiéndote a Pro.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="container py-20 scroll-mt-16">
      <h2 className="text-center text-3xl font-bold text-[#0A0A0A]">
        Preguntas frecuentes
      </h2>
      <div className="mt-10 mx-auto max-w-2xl">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="border-b border-[#E5E7EB]">
              <button
                type="button"
                className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-[#0A0A0A] hover:text-[#16A34A] transition-colors"
                onClick={() => setOpenIndex(isOpen ? null : i)}
              >
                {faq.q}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#6B7280] transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  isOpen ? "max-h-96 pb-4" : "max-h-0"
                }`}
              >
                <p className="text-sm text-[#6B7280] leading-relaxed">{faq.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
