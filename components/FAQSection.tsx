"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "¿En qué país funciona?",
    a: "Por ahora Nichalo funciona exclusivamente para Argentina (Mercado Libre Argentina). Próximamente estará disponible para México y Colombia.",
  },
  {
    q: "¿Necesito tener el producto en stock para analizarlo?",
    a: "No. Podés analizar cualquier producto antes de comprarlo para validar si vale la pena invertir.",
  },
  {
    q: "¿Qué tan actualizados están los datos?",
    a: "Scrapeamos publicaciones en tiempo real cada vez que hacés un análisis. Los datos tienen menos de 24 horas.",
  },
  {
    q: "¿Qué incluye el plan Free?",
    a: "1 análisis por mes, 30 publicaciones analizadas, sin necesidad de tarjeta de crédito.",
  },
  {
    q: "¿Puedo cancelar en cualquier momento?",
    a: "Sí, sin compromisos ni penalidades.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="container py-20">
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
                  isOpen ? "max-h-40 pb-4" : "max-h-0"
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
