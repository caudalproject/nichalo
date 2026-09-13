import type { ReactNode } from "react";
import Link from "next/link";
import { Search, Bot, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FAQSection } from "@/components/FAQSection";
import { HeroMock } from "@/components/HeroMock";
import { PixelTracking } from "@/components/PixelTracking";
import { PrecioPlan } from "@/components/PreciosPais";
import { PricingSection } from "@/components/PricingSection";

// Landing 100% estática (○ en el build): sin Supabase y sin headers().
// El Navbar hidrata su propia sesión del lado cliente y los precios por país
// salen de la cookie que setea el middleware, así que ni la sesión ni la
// geolocalización cuestan TTFB en el hero.

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

// Free y Pro son planes; "Análisis" (Pack 3 / Pack 10) es un producto con una
// cantidad, no dos planes más — por eso vive en su propia card con un toggle
// interno (PacksZone/PackToggleCard) en vez de ser dos columnas separadas.
// Free → Análisis (destacada) → Pro, en ese orden (ver
// Negocios/Nichalo/AI-Sessions/2026-09-12-brief-rediseno-precios).
const PRICING_CARDS = [
  {
    kind: "free" as const,
    name: "Free",
    price: "Gratis" as ReactNode,
    period: "",
    priceNote: null as ReactNode,
    highlighted: false,
    badge: null as null | string,
    features: [
      { label: "Un producto, analizado completo. Sin tarjeta.", included: true, subItems: null as string[] | null },
      { label: "30 publicaciones analizadas — para no adivinar", included: true, subItems: null as string[] | null },
      { label: "Subida de imagen del producto", included: true, subItems: null as string[] | null },
      { label: "Primer análisis completo — sin restricciones", included: true, subItems: null as string[] | null },
    ],
    cta: "Empezar gratis",
    href: "/login",
    mpPlan: null,
  },
  {
    kind: "pro" as const,
    name: "Pro",
    price: <PrecioPlan plan="pro" /> as ReactNode,
    period: "/mes",
    // Precio por análisis (punto 6 del brief): $16.000 / 30 análisis.
    priceNote: "$533 por análisis" as ReactNode,
    // Sin border ni badge de "destacada": la card de Análisis es el default,
    // Pro queda subordinada visualmente (punto 5 del brief).
    highlighted: false,
    badge: "⭐ Más completo" as null | string,
    features: [
      // Primero, porque es lo único que justifica pagar una suscripción en
      // vez de un pack (punto 8 del brief).
      {
        label: "Análisis avanzado Pro",
        included: true,
        subItems: ["De dónde conviene importarlo", "Cuánto necesitás para arrancar", "Qué variante vender primero", "Por dónde conviene vender"] as string[] | null,
      },
      { label: "30 análisis por mes — sin frenar por crédito", included: true, subItems: null as string[] | null },
      { label: "100 publicaciones analizadas — el mayor detalle del mercado", included: true, subItems: null as string[] | null },
    ],
    cta: "Empezar ahora",
    href: null,
    mpPlan: "pro" as const,
  },
];

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <PixelTracking />
        {/* Hero */}
        <section className="py-10 md:py-32">
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
            <HeroMock />
          </div>
        </section>

        {/* Antes y después */}
        <section className="container py-20">
          <div className="text-center" style={{ marginBottom: "2.5rem" }}>
            <h2 className="text-3xl font-bold text-[#0A0A0A]">
              Lo que cambia cuando usás Nichalo
            </h2>
            <p className="mt-3 text-sm text-[#6B7280]">
              De intuición a certeza, antes de gastar un peso
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col md:flex-row md:gap-0 gap-4">
              {/* Columna ANTES */}
              <div className="flex-1 bg-gray-100 rounded-xl p-6 flex flex-col">
                <h3 className="text-base font-bold text-[#0A0A0A] mb-4">Antes</h3>
                <ul className="space-y-3 flex-1">
                  {[
                    "\"Me parece que este producto va a vender\"",
                    "Comprás stock sin saber si hay mercado real",
                    "Publicás y esperás semanas para descubrir que el precio no cierra",
                    "Perdés capital en productos que no rotan",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#0A0A0A]">
                      <span className="text-gray-500 font-bold mt-0.5 shrink-0">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[#6B7280] italic" style={{ borderTop: "0.5px solid var(--border, #E5E7EB)", paddingTop: "16px", marginTop: "20px" }}>
                  Lo que pasa hoy, sin datos.
                </p>
              </div>

              {/* Flecha — solo desktop */}
              <div className="hidden md:flex items-center justify-center px-3">
                <div className="w-10 h-10 rounded-full bg-[#374151] flex items-center justify-center shrink-0">
                  <span className="text-white text-base leading-none">→</span>
                </div>
              </div>

              {/* Columna DESPUÉS */}
              <div className="flex-1 bg-gray-100 rounded-xl p-6 flex flex-col">
                <h3 className="text-base font-bold text-[#0A0A0A] mb-4">Después</h3>
                <p className="text-xs text-[#6B7280] mb-3">Ejemplo real: cargador inalámbrico</p>
                <div className="mb-4">
                  <span className="inline-block text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full bg-green-50 text-[#16A34A]">
                    Score 78 · VIABLE
                  </span>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    "Margen real: +18.4% con tu costo de proveedor",
                    "Precio sugerido según tu perfil de vendedor",
                    "Datos reales de Mercado Libre al momento del análisis",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#0A0A0A]">
                      <span className="text-[#16A34A] font-bold mt-0.5 shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[#6B7280] italic" style={{ borderTop: "0.5px solid var(--border, #E5E7EB)", paddingTop: "16px", marginTop: "20px" }}>
                  Todo esto antes de comprar una sola unidad.
                </p>
              </div>
            </div>
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
                <div className="text-3xl font-bold text-[#0A0A0A]">100%</div>
                <div className="text-sm text-[#6B7280] mt-1">
                  datos reales de ML
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">AR</div>
                <div className="text-sm text-[#6B7280] mt-1">Argentina</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">
                  ~3 min
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
                  <f.Icon className="h-5 w-5 text-[#16A34A]" />
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

        {/* Preview del análisis — siempre visible para usuarios anónimos */}
        <section className="container py-20">
          <div className="mx-auto max-w-3xl text-center mb-10">
            <h2 className="text-3xl font-bold text-[#0A0A0A]">
              Esto es lo que vas a ver
            </h2>
            <p className="mt-3 text-[#6B7280]">
              Así se ve un análisis real — antes de gastar un peso en stock
            </p>
          </div>

          <div className="mx-auto max-w-3xl relative">
            {/* Card de resultado mockeado */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-1.5 w-full bg-green-500" />
              <div className="px-8 py-8">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full bg-green-50 text-green-700">
                    VIABLE
                  </span>
                  <span className="text-sm text-gray-400">Mercado con oportunidad real</span>
                </div>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-6xl md:text-8xl font-black leading-none text-green-500">78</span>
                  <span className="text-2xl text-gray-300 font-light">/100</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-1">Cargador inalámbrico 15W para auto</h3>
                <p className="text-sm text-gray-400 mb-6">Argentina · Costo $ 8.500 · Análisis basado en 45 publicaciones de Mercado Libre</p>

                {/* Métricas */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
                  {[
                    { label: "Ganancia por unidad", value: "+ $ 4.200", green: true },
                    { label: "Margen bruto", value: "+18.4%", green: true },
                    { label: "Publicaciones", value: "45", green: false },
                    { label: "Precio sugerido", value: "$ 18.900", green: false },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                      <div className="text-xs text-gray-500">{m.label}</div>
                      <div className={`mt-1 text-lg font-bold ${m.green ? "text-green-600" : "text-gray-900"}`}>{m.value}</div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-500 mb-6">
                  El precio sugerido no garantiza ganancia: comisión ML (~17%) + envío + impuestos consumen el margen.
                </p>

                {/* Resumen visible */}
                <div className="rounded-xl border border-gray-100 p-4 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resumen</p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Mercado con demanda sostenida y pocos vendedores consolidados. Tu costo te permite competir en precio con margen saludable.
                  </p>
                </div>
              </div>
            </div>

            {/* Contenido bloqueado */}
            <div className="relative overflow-hidden">
              <div className="blur-sm pointer-events-none select-none opacity-100 bg-white rounded-2xl border border-gray-100 p-8 space-y-4">
                {/* Alternativas sugeridas falsas */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Productos con mejor oportunidad</p>
                  <div className="space-y-1">
                    <div className="flex gap-2 text-sm"><span className="text-green-600">1.</span><span className="text-gray-600">Auriculares TWS con cancelación de ruido ANC</span></div>
                    <div className="flex gap-2 text-sm"><span className="text-green-600">2.</span><span className="text-gray-600">Auriculares óseos deportivos para running</span></div>
                  </div>
                </div>
                {/* Competencia falsa */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Competencia</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Precio mínimo</span><span className="font-medium">$ 9.800</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Precio promedio</span><span className="font-medium">$ 16.400</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Precio máximo</span><span className="font-medium">$ 28.000</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Vendedores top</span><span className="font-medium">12 perfiles</span></div>
                  </div>
                </div>
                {/* Riesgos falsos */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Riesgos</p>
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 rounded-2xl border border-gray-100 py-8">
                <span className="text-2xl mb-2">🔒</span>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  Competencia, márgenes y recomendaciones completas
                </p>
                <p className="text-xs text-gray-500 mb-4 text-center px-6">
                  Creá una cuenta gratis y hacé tu primer análisis en ~3 min
                </p>
                <Link href="/login">
                  <Button className="rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white px-6">
                    Empezar gratis →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonios */}
        <section className="bg-[#F9FAFB] py-16 border-y border-[#E5E7EB]">
          <div className="container">
            <div className="mx-auto max-w-3xl grid gap-6 md:grid-cols-3">
              {[
                {
                  texto: "Iba a comprar stock de auriculares. Nichalo me dio 38/100 — SATURADO. Me ahorré la inversión.",
                  autor: "Vendedor de electrónica",
                  pais: "Argentina",
                },
                {
                  texto: "Validé 3 productos en una tarde. El único VIABLE fue el que terminé vendiendo. Los datos son reales.",
                  autor: "Vendedor de hogar",
                  pais: "Argentina",
                },
                {
                  texto: "Lo que más me sirvió fue el precio sugerido según mi perfil. No el promedio del mercado, el que yo podía poner.",
                  autor: "Vendedor principiante",
                  pais: "Argentina",
                },
              ].map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-3">
                  <p className="text-sm text-[#0A0A0A] leading-relaxed">&ldquo;{t.texto}&rdquo;</p>
                  <div>
                    <p className="text-xs font-semibold text-[#0A0A0A]">{t.autor}</p>
                    <p className="text-xs text-[#6B7280]">{t.pais}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA intermedio — siempre visible para usuarios anónimos */}
        <section className="py-12 text-center">
          <div className="container">
            <p className="text-2xl font-bold text-[#0A0A0A]">
              ¿Listo para validar tu próximo producto?
            </p>
            <div className="mt-6">
              <Link href="/login">
                <Button size="lg" className="rounded-md">
                  Empezar gratis →
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-sm text-[#6B7280]">
              1 análisis gratis · Sin tarjeta de crédito
            </p>
          </div>
        </section>

        {/* Pricing */}
        <PricingSection cards={PRICING_CARDS} />

        {/* FAQ */}
        <FAQSection />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] py-8 bg-white">
        <div className="container flex flex-col items-center gap-4 sm:flex-row sm:justify-between text-sm text-[#6B7280]">
          <p>© 2026 Nichalo</p>
          <nav className="flex gap-6">
            <Link href="/terminos" className="hover:text-[#0A0A0A] transition-colors">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-[#0A0A0A] transition-colors">
              Privacidad
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
