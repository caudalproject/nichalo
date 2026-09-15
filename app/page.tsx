import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FAQSection } from "@/components/FAQSection";
import { HeroResultadoReal } from "@/components/HeroResultadoReal";
import { EjemploReal } from "@/components/EjemploReal";
import { SoloAnonimo, SoloLogueado, SoloSinPro } from "@/components/SesionGate";
import { PixelTracking } from "@/components/PixelTracking";
import { PrecioPlan } from "@/components/PreciosPais";
import { PricingSection } from "@/components/PricingSection";

// Landing 100% estática (○ en el build): sin Supabase y sin headers().
// El Navbar hidrata su propia sesión del lado cliente y los precios por país
// salen de la cookie que setea el middleware, así que ni la sesión ni la
// geolocalización cuestan TTFB en el hero.
//
// Rediseño del 14/9 sobre la auditoría del 13/9
// (Negocios/Nichalo/AI-Sessions/2026-09-13-auditoria-landing-y-briefs.md):
// - El producto inventado ("cargador inalámbrico 15W, score 78") aparecía en
//   cuatro secciones. Se fue entero: ahora hay un análisis REAL y público
//   (lib/ejemplo-real.ts), que aparece una sola vez en el hero, y la sección
//   #ejemplo muestra la continuación de ese mismo informe, no una repetición.
// - Se cayeron los tres testimonios anónimos (confirmados inventados el 13/9)
//   y el titular "Desarrollado junto a vendedores top" (plural y no
//   verificable): queda una línea en singular y sin adjetivo propio.
// - "en segundos" → "~3 min" en todas partes (hero, login, stats, lock).
// - El CTA de cierre pasó a después de la FAQ; antes pedía la conversión una
//   sección ANTES de mostrar el precio.
// - Navbar con anclas + línea de ancla de precio en el hero, sin subir la
//   sección de planes al top.

// Reemplaza a las tres feature cards. Son los tres pasos del producto, no
// tres adjetivos. "Revisamos cientos de publicaciones" se cayó: el techo real
// es 100 (PLAN_CONFIG.pro.maxItems), así que "cientos" no era verificable.
const PASOS = [
  {
    n: "1",
    title: "Decinos qué querés vender",
    description: "El producto y cuánto te cuesta. Nada más.",
  },
  {
    n: "2",
    title: "Scrapeamos el mercado real",
    description:
      "Hasta 100 publicaciones de Mercado Libre, en el momento en que apretás analizar.",
  },
  {
    n: "3",
    title: "Te damos un veredicto en ~3 min",
    description:
      "VIABLE, MARGINAL o SATURADO, con el razonamiento y los números detrás.",
  },
];

// La stat del medio decía "AR / Argentina" — presentaba una limitación como
// si fuera un logro (auditoría, problema 6). Reemplazada por una que suma.
const STATS = [
  { valor: "100%", label: "publicaciones reales de ML" },
  { valor: "hasta 100", label: "publicaciones por análisis" },
  { valor: "~3 min", label: "por análisis" },
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

        {/* 1 — Hero */}
        <section className="py-10 md:py-32">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#0A0A0A] leading-tight max-w-4xl mx-auto">
              ¿Tu producto va a vender en{" "}
              <span className="text-[#16A34A] whitespace-nowrap">Mercado Libre</span>?
            </h1>
            <p className="mt-6 text-lg text-[#6B7280] leading-relaxed max-w-xl mx-auto">
              Antes de comprar stock, sabé si el mercado tiene espacio para vos.
              Analizamos publicaciones reales de Mercado Libre y te damos un
              veredicto en ~3 minutos.
            </p>
            <HeroSection />
            <SoloAnonimo>
              <HeroResultadoReal />
            </SoloAnonimo>
          </div>
        </section>

        <SoloAnonimo>
          {/* 2 — Cómo funciona */}
          <section id="como-funciona" className="container py-20 scroll-mt-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-[#0A0A0A]">Cómo funciona</h2>
            </div>

            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              {PASOS.map((p) => (
                <Card key={p.n} className="border-[#E5E7EB] rounded-lg">
                  <CardContent className="p-6">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16A34A] text-sm font-bold text-white">
                      {p.n}
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-[#0A0A0A]">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#6B7280] leading-relaxed">
                      {p.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 max-w-xl mx-auto text-center">
              {STATS.map((s) => (
                <div key={s.label}>
                  {/* whitespace-nowrap + text-lg: "hasta 100" no entra en una
                      columna de ~107px a 393px de ancho y se partia en dos
                      lineas, desalineando los labels de las tres stats. */}
                  <div className="text-lg md:text-3xl font-bold text-[#0A0A0A] whitespace-nowrap">
                    {s.valor}
                  </div>
                  <div className="text-sm text-[#6B7280] mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Antes era un titular de 2xl y en plural ("vendedores top de
                Mercado Libre"). Es una sola persona, y "top" es un adjetivo
                nuestro, no una credencial que dé ML — misma familia que el
                badge "Más elegido" que se cayó por falso el 13/9.
                Esta línea es la versión final, no un placeholder: JP decidió
                el 13/9 no pedirle nada al vendedor (ni nombre, ni cita, ni
                credencial). No reabrir. */}
            <p className="mt-12 text-center text-sm text-[#6B7280]">
              Desarrollado con el feedback de un vendedor de Mercado Libre en
              actividad.
            </p>
          </section>

          {/* 3 — Antes y después */}
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

                {/* Columna DESPUÉS — se le sacaron la card y el "Score 78" del
                    producto inventado. Ahora describe capacidades, no un
                    resultado falso. */}
                <div className="flex-1 bg-gray-100 rounded-xl p-6 flex flex-col">
                  <h3 className="text-base font-bold text-[#0A0A0A] mb-4">Después</h3>
                  <ul className="space-y-3 flex-1">
                    {[
                      "Sabés cuántos venden lo mismo y a qué precio, antes de comprar",
                      "Un precio sugerido calculado con tu costo real, no el promedio del mercado",
                      "Un veredicto — VIABLE, MARGINAL o SATURADO — con el razonamiento detrás",
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

          {/* 4 — Ejemplo real */}
          <EjemploReal />
        </SoloAnonimo>

        {/* 5 — Planes. El logueado free o con packs la sigue viendo: es su
            único camino de upgrade (/planes redirige a /#planes). Solo se
            oculta para quien ya está en Pro. */}
        <SoloSinPro>
          <PricingSection cards={PRICING_CARDS} />
        </SoloSinPro>

        {/* 6 — FAQ */}
        <FAQSection />

        {/* 7 — CTA de cierre. Va DESPUÉS de la FAQ: antes estaba una sección
            antes de los planes, o sea que pedía la decisión antes de dar el
            dato necesario para decidirla (auditoría, problema 3). */}
        <section className="py-16 text-center bg-[#F9FAFB] border-t border-[#E5E7EB]">
          <div className="container">
            <p className="text-2xl font-bold text-[#0A0A0A]">
              ¿Qué producto estás por comprar?
            </p>
            <SoloAnonimo>
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
            </SoloAnonimo>
            <SoloLogueado>
              <div className="mt-6">
                <Link href="/analizar">
                  <Button size="lg" className="rounded-md">
                    Nuevo análisis →
                  </Button>
                </Link>
              </div>
            </SoloLogueado>
          </div>
        </section>
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
