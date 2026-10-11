import { categoriaDesdeProducto, type CategoriaML } from "@/lib/comisiones";

/**
 * "Donde conseguir este producto" — TAB 8 del plan de tabs (11/10/2026).
 *
 * POR QUE EXISTE
 *
 * El analisis no tiene ninguna fuente de precios mayoristas:
 * `rango_mayorista_estimado` se borro el 21/9 porque lo inventaba el modelo.
 * El marketplace de proveedores quedo descartado por aritmetica (dos lados,
 * cero conversaciones con proveedores, ~16 h/semana). Esto es el 80/20:
 * links REALES, ESTATICOS y CURADOS A MANO por categoria, con la busqueda
 * prellenada cuando el sitio lo permite. Sin scraping, sin plataforma.
 *
 * Y genera el dato que justificaria el marketplace: cada click se anota en
 * `eventos_embudo` (`click_proveedor`) y se lee con `select * from
 * v_proveedores;`. Contrato del tab: medir 4 semanas y recien ahi decidir.
 *
 * COMO SE CURO (11/10)
 *
 * Cada URL y cada patron de busqueda se verifico a mano ese dia. Reglas:
 *   - Solo sitios que existen y venden por cantidad o a revendedores.
 *   - Busqueda prellenada solo si el sitio la acepta por URL. Si no, home.
 *   - 1688 queda AFUERA a proposito: busca en chino (una consulta en
 *     castellano devuelve ruido) y desde Argentina solo se compra via agente.
 *     Prometerle a alguien una busqueda que no le sirve es peor que no
 *     mostrarla.
 *   - Locales de AR solo donde hay uno de verdad para la categoria. Una
 *     categoria sin local no se rellena con cualquier cosa.
 *
 * Si una categoria se queda sin links, `proveedoresPara` devuelve null y el
 * bloque no aparece.
 *
 * Este archivo no importa nada de servidor: lo usan la pagina (server), el
 * componente (client) y /api/eventos (lista blanca de origenes).
 */

export type ProveedorId =
  | "alibaba"
  | "aliexpress"
  | "ml_mayor"
  | "avellaneda_toque"
  | "bella_paloma"
  | "elit";

export const CATEGORIA_SLUG: Record<CategoriaML, string> = {
  "Electrónica/tecnología": "electronica",
  "Electrodomésticos": "electrodomesticos",
  "Ropa y accesorios": "ropa",
  "Deportes y fitness": "deportes",
  "Hogar y jardín": "hogar",
  Juguetes: "juguetes",
  Resto: "resto",
};

type Pais = "AR" | "MX" | "CO";

interface Proveedor {
  nombre: string;
  /** Una linea: para que sirve y que pide. Sin promesas. */
  nota: string;
  /** null = este proveedor no aplica a ese pais. */
  url: (termino: string, slug: string, pais: Pais) => string | null;
}

const PROVEEDORES: Record<ProveedorId, Proveedor> = {
  alibaba: {
    nombre: "Alibaba",
    nota: "Fábricas y precio por volumen. Casi siempre piden un mínimo de compra.",
    url: (t) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(t)}`,
  },
  aliexpress: {
    nombre: "AliExpress",
    nota: "Lotes chicos o una muestra para probar antes de comprar en cantidad.",
    url: (_t, s) => `https://es.aliexpress.com/w/wholesale-${s}.html`,
  },
  ml_mayor: {
    nombre: "Mercado Libre — por mayor",
    nota: "Vendedores del país que venden en lote, sin importar.",
    url: (_t, s, pais) =>
      pais === "MX"
        ? `https://listado.mercadolibre.com.mx/${s}-por-mayoreo`
        : pais === "CO"
          ? `https://listado.mercadolibre.com.co/${s}-por-mayor`
          : `https://listado.mercadolibre.com.ar/${s}-por-mayor`,
  },
  avellaneda_toque: {
    nombre: "Avellaneda a un Toque",
    nota: "Locales mayoristas de Av. Avellaneda (Flores). Se entra por rubro, no por búsqueda.",
    url: (_t, _s, pais) => (pais === "AR" ? "https://www.avellanedaauntoque.com/" : null),
  },
  bella_paloma: {
    nombre: "Bella Paloma",
    nota: "Distribuidora de bazar y hogar de Once, con locales físicos. El catálogo es por consulta.",
    url: (_t, _s, pais) => (pais === "AR" ? "https://bellapaloma.com.ar/" : null),
  },
  elit: {
    nombre: "Elit",
    nota: "Mayorista de tecnología. Para comprar pide alta como revendedor (CUIT).",
    url: (_t, _s, pais) => (pais === "AR" ? "https://www.elit.com.ar/" : null),
  },
};

/** Orden = orden en pantalla. Primero lo local (sin importar), despues afuera. */
const POR_CATEGORIA: Record<CategoriaML, ProveedorId[]> = {
  "Ropa y accesorios": ["ml_mayor", "avellaneda_toque", "alibaba", "aliexpress"],
  "Hogar y jardín": ["ml_mayor", "bella_paloma", "alibaba", "aliexpress"],
  "Electrónica/tecnología": ["ml_mayor", "elit", "alibaba", "aliexpress"],
  "Electrodomésticos": ["ml_mayor", "alibaba", "aliexpress"],
  "Deportes y fitness": ["ml_mayor", "alibaba", "aliexpress"],
  Juguetes: ["ml_mayor", "alibaba", "aliexpress"],
  Resto: ["ml_mayor", "alibaba", "aliexpress"],
};

/** Todos los `origen` validos de `click_proveedor` (lista blanca de /api/eventos). */
export const ORIGENES_CLICK_PROVEEDOR: readonly string[] = (
  Object.keys(POR_CATEGORIA) as CategoriaML[]
).flatMap((c) => POR_CATEGORIA[c].map((p) => `${CATEGORIA_SLUG[c]}:${p}`));

export const ORIGENES_VIO_PROVEEDORES: readonly string[] = Object.values(CATEGORIA_SLUG);

/**
 * El termino para prellenar. Los usuarios pegan cualquier cosa en "producto":
 * links de Mercado Libre enteros, descripciones de 120 caracteres, titulos con
 * "|". Una busqueda de 20 palabras en Alibaba no trae nada, asi que se recorta
 * a lo que un humano tipearia.
 */
export function terminoParaProveedores(producto: string): string {
  let t = producto.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      // .../horno-y-freidora-de-aire-af950/p/MLA123 -> "horno y freidora de aire af950"
      const seg = new URL(t).pathname.split("/").find((s) => s.includes("-"));
      t = seg ? seg.replace(/-/g, " ") : "";
    } catch {
      t = "";
    }
  }
  t = t
    .replace(/[|—–()\[\]{}"“”'´`*#:;!?¿¡]/g, " ")
    // Punto y coma decimales sobreviven ("20.1", "2,5 mm"); los de puntuacion no.
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.split(" ").slice(0, 6).join(" ");
}

function slugificar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface LinkProveedor {
  id: ProveedorId;
  nombre: string;
  nota: string;
  href: string;
  /** `<categoria>:<proveedor>` — el origen que se anota en el click. */
  origen: string;
}

export interface BloqueProveedores {
  categoria: CategoriaML;
  categoriaSlug: string;
  termino: string;
  links: LinkProveedor[];
}

export function proveedoresPara(producto: string, pais: string): BloqueProveedores | null {
  const termino = terminoParaProveedores(producto);
  const slug = slugificar(termino);
  if (!termino || !slug) return null;

  const p: Pais = pais === "MX" || pais === "CO" ? pais : "AR";
  const categoria = categoriaDesdeProducto(termino);
  const categoriaSlug = CATEGORIA_SLUG[categoria];

  const links: LinkProveedor[] = [];
  for (const id of POR_CATEGORIA[categoria] ?? []) {
    const prov = PROVEEDORES[id];
    const href = prov.url(termino, slug, p);
    if (!href) continue;
    links.push({ id, nombre: prov.nombre, nota: prov.nota, href, origen: `${categoriaSlug}:${id}` });
  }
  if (links.length === 0) return null;
  return { categoria, categoriaSlug, termino, links };
}
