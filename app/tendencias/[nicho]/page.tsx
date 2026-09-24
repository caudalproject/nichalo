import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SparklineInteres } from "@/components/SparklineInteres";
import {
  NICHOS,
  buscarDefinicion,
  describirInteres,
  linkAnalizar,
  type ProductoTendencia,
  type TerminoTendencia,
} from "@/lib/tendencias";
import { TENDENCIAS as tendencias } from "@/lib/tendencias-datos";
import { SITIO } from "@/lib/sitio";

export function generateStaticParams() {
  return NICHOS.map((n) => ({ nicho: n.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { nicho: string };
}): Metadata {
  const def = buscarDefinicion(params.nicho);
  if (!def) return { title: "Tendencias | Nichalo" };

  const titulo = `Qué se está buscando en ${def.nombre} — Argentina | Nichalo`;
  const descripcion = `Términos que más subieron en búsquedas de ${def.nombre.toLowerCase()} en Argentina. ${def.descripcion} Datos de Google Trends, gratis y sin registro.`;

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `${SITIO}/tendencias/${def.slug}` },
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `${SITIO}/tendencias/${def.slug}`,
      type: "article",
    },
  };
}

/**
 * Un termino con su variacion y el link al analisis.
 *
 * Ese link es el unico camino al pago que tiene esta seccion, y por eso cada
 * termino es clickeable y no decorativo.
 */
function Termino({ t, destacar }: { t: TerminoTendencia; destacar?: boolean }) {
  return (
    <li>
      <Link
        href={linkAnalizar(t.termino)}
        className="group flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0"
      >
        <span className="text-sm group-hover:text-green-600 transition-colors">
          {t.termino}
        </span>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            destacar ? "text-green-600 font-medium" : "text-muted-foreground"
          }`}
        >
          {destacar ? t.variacion : ""}
        </span>
      </Link>
    </li>
  );
}

function Producto({ p }: { p: ProductoTendencia }) {
  const sinDatos = p.subiendo.length === 0 && p.masBuscado.length === 0;

  return (
    <section className="rounded-lg border border-border p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-semibold capitalize">{p.producto}</h2>
        <Link
          href={linkAnalizar(p.producto)}
          className="text-xs text-green-600 hover:underline shrink-0"
        >
          Analizar {p.producto} →
        </Link>
      </div>

      {sinDatos ? (
        /*
          Un producto sin datos se dice, no se esconde ni se rellena. Google no
          devuelve relacionadas cuando el volumen de busqueda no le alcanza en
          la ventana de 12 meses — medido el 24/9 con "accesorios para perros",
          que vuelve vacio a 12 meses y a 90 dias. Inventar algo aca seria
          exactamente el tipo de dato que este producto existe para no dar.
        */
        <p className="mt-3 text-sm text-muted-foreground">
          Google no tiene suficiente volumen de búsqueda en Argentina para este
          producto en los últimos 12 meses.
        </p>
      ) : (
        <>
          {p.subiendo.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subiendo
              </h3>
              <ul className="mt-1">
                {p.subiendo.map((t) => (
                  <Termino key={t.termino} t={t} destacar />
                ))}
              </ul>
            </div>
          )}

          {p.masBuscado.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Más buscado
              </h3>
              <ul className="mt-1">
                {p.masBuscado.map((t) => (
                  <Termino key={t.termino} t={t} />
                ))}
              </ul>
            </div>
          )}

          {p.interes.length >= 8 && (
            <div className="mt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Interés en el tiempo
              </h3>
              <p className="mt-1 text-sm">{describirInteres(p.variacionAnual)}</p>
              <SparklineInteres puntos={p.interes} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function NichoPage({ params }: { params: { nicho: string } }) {
  const def = buscarDefinicion(params.nicho);
  if (!def) notFound();

  const nicho = tendencias.nichos.find((n) => n.slug === params.nicho);
  const productos = nicho?.productos ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/tendencias"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Todas las categorías
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Qué se está buscando en {def.nombre}
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          {def.descripcion} Lo que más subió en búsquedas en Argentina durante
          el último año, según Google Trends.
        </p>

        <div className="mt-8 space-y-5">
          {productos.length > 0 ? (
            productos.map((p) => <Producto key={p.producto} p={p} />)
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay datos cargados para esta categoría.
            </p>
          )}
        </div>

        {/*
          El cierre explica el limite del dato y convierte ese limite en el
          argumento del analisis. No es un disclaimer defensivo: es literalmente
          la razon por la que el producto pago existe.
        */}
        <div className="mt-10 rounded-lg border border-green-600/30 bg-green-600/5 p-5">
          <h2 className="font-semibold">Esto te dice qué se busca, no qué te conviene</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Que un producto suba en búsquedas no significa que puedas ganar
            plata vendiéndolo: puede estar saturado, dejarte un margen mínimo o
            tener un precio de equilibrio imposible. Eso se sabe mirando la
            competencia real en Mercado Libre contra tu costo.
          </p>
          <Link
            href="/analizar"
            className="mt-4 inline-block text-sm font-medium text-green-600 hover:underline"
          >
            Analizar un producto →
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Datos de Google Trends para Argentina, últimos 12 meses. Los valores
          de interés son relativos al pico de cada término, no cantidades de
          búsquedas.
        </p>
      </main>
    </div>
  );
}
