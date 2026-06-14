import Link from "next/link";
import { Check, X, Search, Bot, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FAQSection } from "@/components/FAQSection";
import { PricingCheckoutButton } from "@/components/PricingCheckoutButton";
import { getPaisFromHeaders, getPreciosPorPais } from "@/lib/geolocation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

export default async function LandingPage() {
  const pais = getPaisFromHeaders();
  const precios = getPreciosPorPais(pais);
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;
  const profile = user ? (await supabase
    .from("users")
    .select("plan, analisis_restantes")
    .eq("id", user.id)
    .maybeSingle()).data : null;

  const PLANS = [
    {
      name: "Free",
      price: "Gratis",
      period: "",
      priceNote: null as null | string,
      popular: false,
      badge: null as null | string,
      mpPlan: null as null,
      features: [
        { label: "1 análisis por mes", included: true, subItems: null as string[] | null },
        { label: "30 publicaciones analizadas", included: true, subItems: null as string[] | null },
        { label: "Subida de imagen del producto", included: true, subItems: null as string[] | null },
        { label: "Primer análisis completo — sin restricciones", included: true, subItems: null as string[] | null },
      ],
      cta: "Empezar gratis",
      href: "/login",
    },
    {
      name: "Starter",
      price: precios.starter,
      period: "/mes",
      priceNote: (pais === "MX" ? "~$21 MXN por análisis" : pais === "CO" ? "~$5.000 COP por análisis" : "~$1.700 ARS por análisis") as null | string,
      popular: true,
      badge: "Más popular" as null | string,
      mpPlan: "starter" as const,
      features: [
        { label: "10 análisis por mes", included: true, subItems: null as string[] | null },
        { label: "50 publicaciones analizadas", included: true, subItems: null as string[] | null },
        { label: "Subida de imagen del producto", included: true, subItems: null as string[] | null },
        { label: "Análisis completo desbloqueado", included: true, subItems: null as string[] | null },
      ],
      cta: "Empezar ahora",
      href: null,
    },
    {
      name: "Pro",
      price: precios.pro,
      period: "/mes",
      priceNote: "El análisis más completo del mercado" as null | string,
      popular: false,
      badge: "⭐ Más completo" as null | string,
      mpPlan: "pro" as const,
      features: [
        { label: "30 análisis por mes", included: true, subItems: null as string[] | null },
        { label: "100 publicaciones analizadas", included: true, subItems: null as string[] | null },
        { label: "Subida de imagen del producto", included: true, subItems: null as string[] | null },
        {
          label: "Análisis avanzado Pro",
          included: true,
          subItems: ["Origen del producto", "Presupuesto inicial", "Variantes del producto", "Canal de distribución"] as string[] | null,
        },
        { label: "Análisis completo desbloqueado", included: true, subItems: null as string[] | null },
        { label: "Mayor profundidad de datos", included: true, subItems: null as string[] | null },
      ],
      cta: "Empezar ahora",
      href: null,
    },
  ];

  return (
    <>
      <Navbar
          email={user?.email}
          plan={profile?.plan}
          analisisRestantes={profile?.analisis_restantes}
        />
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
            <HeroSection isLoggedIn={!!user} />
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
                <div className="text-3xl font-bold text-[#0A0A0A]">100+</div>
                <div className="text-sm text-[#6B7280] mt-1">
                  productos analizados
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0A0A0A]">🇦🇷</div>
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

        {!isLoggedIn && (
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
              <div className="h-1.5 w-full bg-red-500" />
              <div className="px-8 py-8">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full bg-red-50 text-red-700">
                    SATURADO
                  </span>
                  <span className="text-sm text-gray-400">Mercado sin espacio para entrar</span>
                </div>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-8xl font-black leading-none text-red-500">38</span>
                  <span className="text-2xl text-gray-300 font-light">/100</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-1">Auriculares Bluetooth genéricos</h3>
                <p className="text-sm text-gray-400 mb-6">Argentina · Costo $ 12.000 · Análisis basado en 60 publicaciones de Mercado Libre</p>

                {/* Métricas */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
                  {[
                    { label: "Ganancia por unidad", value: "- $ 2.100" },
                    { label: "Margen bruto", value: "-8.3%" },
                    { label: "Publicaciones", value: "60" },
                    { label: "Precio sugerido", value: "$ 18.500" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                      <div className="text-xs text-gray-500">{m.label}</div>
                      <div className={`mt-1 text-lg font-bold ${m.value.startsWith("-") ? "text-red-600" : "text-gray-900"}`}>{m.value}</div>
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
                    Mercado saturado con 60+ vendedores establecidos. Tu costo no te permite competir en precio. Explorá los productos alternativos sugeridos.
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
                  Creá una cuenta gratis y hacé tu primer análisis en 2 minutos
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
        )}

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

        {/* CTA intermedio */}
        <section className="py-12 text-center">
          <div className="container">
            <p className="text-2xl font-bold text-[#0A0A0A]">
              ¿Listo para validar tu próximo producto?
            </p>
            <div className="mt-6">
              <Link href={isLoggedIn ? "/analizar" : "/login"}>
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
        <section id="planes" className="bg-[#F9FAFB] py-20 border-y border-[#E5E7EB]">
          <div className="container">
            <h2 className="text-center text-3xl font-bold text-[#0A0A0A]">
              Planes
            </h2>
            <p className="mt-3 text-center text-[#6B7280]">
              Elegí el plan que mejor se adapta a tu ritmo de trabajo.
            </p>
            <p className="mt-1 text-center text-sm text-[#6B7280]">
              Precios en {pais === "MX" ? "pesos mexicanos (MXN)" : pais === "CO" ? "pesos colombianos (COP)" : "pesos argentinos (ARS)"}
            </p>
            <div className="mt-12 mx-auto grid max-w-5xl gap-6 md:grid-cols-3 items-start">
              {PLANS.map((plan) => (
                <div key={plan.name} className="relative">
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap text-white ${
                          plan.popular ? "bg-[#16A34A]" : "bg-[#0A0A0A]"
                        }`}
                      >
                        {plan.badge}
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
                      {plan.priceNote && (
                        <p className="mt-1 text-xs text-[#6B7280]">{plan.priceNote}</p>
                      )}
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
                            <div>
                              <span
                                className={
                                  feat.included ? "text-[#0A0A0A]" : "text-[#6B7280]"
                                }
                              >
                                {feat.label}
                              </span>
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
                        {plan.mpPlan ? (
                          <PricingCheckoutButton
                            plan={plan.mpPlan}
                            variant="default"
                            label={plan.cta}
                          />
                        ) : (
                          <Link href={plan.href!} className="block">
                            <Button
                              className="w-full rounded-md"
                              variant="outline"
                            >
                              {plan.cta}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            {/* Comparison table */}
            <div className="mt-16 max-w-3xl mx-auto overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <th className="text-left py-3 px-5 font-medium text-[#6B7280] w-[40%]"></th>
                    <th className="text-center py-3 px-4 font-medium text-[#6B7280]">Free</th>
                    <th className="text-center py-3 px-4 font-medium text-[#6B7280]">Starter</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">Pro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {[
                    { label: "Análisis/mes", free: "1", starter: "10", pro: "30" },
                    { label: "Publicaciones", free: "30", starter: "50", pro: "100" },
                    { label: "Imagen del producto", free: "✅", starter: "✅", pro: "✅" },
                    { label: "Análisis avanzado", free: "❌", starter: "❌", pro: "✅" },
                    { label: "Precio sugerido", free: "✅", starter: "✅", pro: "✅" },
                    { label: "Secciones completas", free: "❌", starter: "✅", pro: "✅" },
                  ].map((row) => (
                    <tr key={row.label}>
                      <td className="py-3 px-5 text-[#0A0A0A]">{row.label}</td>
                      <td className="py-3 px-4 text-center text-[#6B7280]">{row.free}</td>
                      <td className="py-3 px-4 text-center text-[#6B7280]">{row.starter}</td>
                      <td className="py-3 px-4 text-center font-medium text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">{row.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-8 text-center text-sm text-[#6B7280]">
              Sin contratos. Cancelá cuando quieras.
            </p>
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
