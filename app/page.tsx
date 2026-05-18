import Link from "next/link";
import { Check, X, Search, Bot, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FAQSection } from "@/components/FAQSection";

const FEATURES = [
  {
    Icon: Search,
    title: "Scraping en vivo",
    description:
      "Revisamos cientos de publicaciones reales de ML al momento.",
  },
  {
    Icon: Bot,
    title: "IA que entiende el mercado",
    description:
      "Gemini analiza competencia, márgenes y tendencias en español.",
  },
  {
    Icon: CheckCircle,
    title: "Decisión clara",
    description:
      "VIABLE, MARGINAL o SATURADO — con el razonamiento detrás.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/mes",
    popular: false,
    features: [
      { label: "1 análisis por mes", included: true },
      { label: "Análisis básico (30 publicaciones)", included: true },
      { label: "Subida de imagen del producto", included: false },
    ],
    cta: "Empezar gratis",
    href: "/login",
  },
  {
    name: "Starter",
    price: "$12",
    period: "/mes",
    popular: true,
    features: [
      { label: "10 análisis por mes", included: true },
      { label: "Análisis estándar (200 publicaciones)", included: true },
      { label: "Subida de imagen del producto", included: false },
    ],
    cta: "Empezar ahora",
    href: "/login",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mes",
    popular: false,
    features: [
      { label: "30 análisis por mes", included: true },
      { label: "Análisis profundo (500 publicaciones)", included: true },
      { label: "Subida de imagen del producto", included: true },
    ],
    cta: "Empezar ahora",
    href: "/login",
  },
];

const STEPS = [
  {
    title: "Ingresá tu producto",
    description: "Ingresás tu producto y costo estimado",
  },
  {
    title: "Analizamos el mercado",
    description: "Analizamos cientos de publicaciones reales en ML",
  },
  {
    title: "Recibís tu veredicto",
    description: "Recibís un veredicto claro con recomendaciones accionables",
  },
];

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="py-16 md:py-32">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#0A0A0A] leading-tight max-w-4xl mx-auto">
              ¿Tu producto va a vender en{" "}
              <span className="text-[#16A34A] whitespace-nowrap">Mercado Libre</span>?
            </h1>
            <p className="mt-6 text-lg text-[#6B7280] leading-relaxed max-w-xl mx-auto">
              Antes de comprar stock, sabé exactamente si el mercado tiene
              espacio para vos. Análisis real con datos de ML en segundos.
            </p>
            <HeroSection />
          </div>
        </section>

        {/* Social proof */}
        <section className="bg-[#F9FAFB] py-16 border-y border-[#E5E7EB]">
          <div className="container">
            <p className="text-center text-xl font-semibold text-[#0A0A0A] md:text-2xl">
              Desarrollado junto a vendedores top de Mercado Libre
            </p>
            <div className="mt-10 grid grid-cols-3 gap-6 max-w-xl mx-auto text-center">
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">500+</div>
                <div className="text-sm text-[#6B7280] mt-1">
                  productos analizados
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">3</div>
                <div className="text-sm text-[#6B7280] mt-1">países</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">
                  &lt; 60s
                </div>
                <div className="text-sm text-[#6B7280] mt-1">
                  por análisis
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container py-20">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-[#E5E7EB] rounded-lg">
                <CardContent className="p-6">
                  <div className="inline-flex items-center justify-center rounded-xl bg-[#DCFCE7] p-3">
                    <f.Icon className="h-8 w-8 text-[#16A34A]" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#0A0A0A]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#6B7280] leading-relaxed">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-[#F9FAFB] py-20 border-y border-[#E5E7EB]">
          <div className="container">
            <h2 className="text-center text-3xl font-bold text-[#0A0A0A]">
              Planes
            </h2>
            <p className="mt-3 text-center text-[#6B7280]">
              Elegí el plan que mejor se adapta a tu ritmo de trabajo.
            </p>
            <p className="mt-1 text-center text-sm text-[#6B7280]">
              Precios en dólares estadounidenses (USD)
            </p>
            <div className="mt-12 mx-auto grid max-w-5xl gap-6 md:grid-cols-3 items-start">
              {PLANS.map((plan) => (
                <div key={plan.name} className="relative">
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-[#16A34A] text-white px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                        Más popular
                      </span>
                    </div>
                  )}
                  <Card
                    className={`rounded-lg ${
                      plan.popular
                        ? "border-2 border-[#16A34A] shadow-md"
                        : "border-[#E5E7EB]"
                    }`}
                  >
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold text-[#0A0A0A]">
                        {plan.name}
                      </h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-[#0A0A0A]">
                          {plan.price}
                        </span>
                        <span className="text-[#6B7280] text-sm">
                          {plan.period}
                        </span>
                      </div>
                      <ul className="mt-6 space-y-3">
                        {plan.features.map((feat) => (
                          <li
                            key={feat.label}
                            className="flex items-start gap-2.5 text-sm"
                          >
                            {feat.included ? (
                              <Check className="h-4 w-4 text-[#16A34A] mt-0.5 shrink-0" />
                            ) : (
                              <X className="h-4 w-4 text-[#6B7280] mt-0.5 shrink-0" />
                            )}
                            <span
                              className={
                                feat.included
                                  ? "text-[#0A0A0A]"
                                  : "text-[#6B7280]"
                              }
                            >
                              {feat.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-8">
                        <Link href={plan.href} className="block">
                          <Button
                            className="w-full rounded-md"
                            variant={plan.popular ? "default" : "outline"}
                          >
                            {plan.cta}
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="container py-20">
          <h2 className="text-center text-3xl font-bold text-[#0A0A0A]">
            Cómo funciona
          </h2>
          <div className="mt-12 mx-auto grid max-w-3xl gap-10 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={i} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#0A0A0A] text-white text-lg font-bold">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-sm font-bold text-[#0A0A0A]">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-[#6B7280] leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <FAQSection />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] py-8 bg-white">
        <div className="container flex flex-col items-center gap-4 sm:flex-row sm:justify-between text-sm text-[#6B7280]">
          <p>© 2026 Nichalo</p>
          <nav className="flex gap-6">
            <Link href="#" className="hover:text-[#0A0A0A] transition-colors">
              Términos
            </Link>
            <Link href="#" className="hover:text-[#0A0A0A] transition-colors">
              Privacidad
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
