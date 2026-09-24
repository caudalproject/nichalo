import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { NICHOS } from "@/lib/tendencias";
import { TENDENCIAS as tendencias } from "@/lib/tendencias-datos";

export const metadata: Metadata = {
  title: "Qué se está buscando en Argentina — Tendencias | Nichalo",
  description:
    "Qué productos están subiendo en búsquedas en Argentina, por categoría. Datos de Google Trends, actualizados y gratis. Sin registro.",
  alternates: { canonical: "https://nichalo.com/tendencias" },
  openGraph: {
    title: "Qué se está buscando en Argentina — Tendencias",
    description:
      "Qué productos están subiendo en búsquedas en Argentina, por categoría. Gratis y sin registro.",
    url: "https://nichalo.com/tendencias",
    type: "website",
  },
};

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

export default function TendenciasPage() {
  const porSlug = new Map(tendencias.nichos.map((n) => [n.slug, n]));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Qué se está buscando en Argentina
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Los términos que más subieron en búsquedas durante el último año, por
          categoría. Sirve para encontrar una idea cuando todavía no tenés una.
          Es gratis y no hace falta registrarse.
        </p>

        {/*
          La linea del paywall, dicha en la cara y no escondida. El usuario
          entiende exactamente que le da esta pagina y que no, y por que el
          analisis se paga. Decirlo funciona mejor que disimularlo.
        */}
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Acá vas a ver <strong className="text-foreground">qué se busca</strong>.
          Si ese producto te conviene a vos —con tu costo, tu margen y tu precio
          de equilibrio— eso lo responde el análisis.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {NICHOS.map((def) => {
            const nicho = porSlug.get(def.slug);
            const terminos =
              nicho?.productos.reduce((n, p) => n + p.subiendo.length, 0) ?? 0;

            return (
              <Link
                key={def.slug}
                href={`/tendencias/${def.slug}`}
                className="block rounded-lg border border-border p-5 hover:border-green-600 transition-colors"
              >
                <h2 className="font-semibold">{def.nombre}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {def.descripcion}
                </p>
                <p className="mt-3 text-xs text-green-600">
                  {terminos > 0
                    ? `${terminos} término${terminos === 1 ? "" : "s"} subiendo`
                    : "Ver categoría"}
                </p>
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Datos de Google Trends para Argentina, últimos 12 meses. Última
          actualización: {fechaCorta(tendencias.generado)}.
        </p>
      </main>
    </div>
  );
}
