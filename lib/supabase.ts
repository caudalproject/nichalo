import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export type Plan = "free" | "starter" | "pro";
export type Veredicto = "VIABLE" | "SATURADO" | "MARGINAL";

export interface UserRow {
  id: string;
  email: string;
  plan: Plan;
  creditos_ciclo: number;
  creditos_pack: number;
  ultimo_refill_at: string | null;
  created_at: string;
}

export interface TopVendedor {
  nombre: string;
  precio: number;
  ventas: number;
  reputacion: string;
  diferenciador: string;
}

export interface DistribucionPrecio {
  rango: string;
  cantidad: number;
}

export interface AnalysisResult {
  veredicto: Veredicto;
  score: number;
  resumen: string;
  competencia: {
    cantidad_vendedores: number;
    precio_minimo: number;
    precio_maximo: number;
    precio_promedio: number;
    top_vendedores: TopVendedor[];
    palabras_clave_titulos: string[];
    distribucion_precios: DistribucionPrecio[];
  };
  margen: {
    precio_sugerido_venta: number;
    comision_ml_estimada: number;
    ganancia_estimada: number;
    margen_porcentaje: number;
    costo_evaluacion: "COMPETITIVO" | "ALTO" | "MUY_ALTO";
  };
  tendencia: string;
  diferenciadores_oportunidad: string[];
  riesgos: string[];
  recomendacion: string;
  titulo_sugerido_publicacion: string;
  imagen_url?: string;
  publicaciones_analizadas?: number;
  cache_date?: string;
  total_publicaciones_ml?: number;
  google_trends_interest?: number;
  google_trends_trending?: boolean;
  moneda?: string;
  tasa_cambio?: number;
  comision_detalle?: {
    tipo_publicacion: string;
    porcentaje: number;
    monto_ars: number;
    monto_usd: number;
    cargo_fijo_ars: number;
  };
  /**
   * Confianza estadistica del scrape. Ausente en los analisis anteriores al
   * 16/9 — la UI tiene que tratar `undefined` como "no medido", NO como
   * "alta". Ver `lib/confianza.ts`.
   */
  confianza?: import("./confianza").Confianza | null;
  precio_stats?: import("./confianza").PrecioStats | null;
  /**
   * Lo que produce el "Analisis avanzado Pro". Existe como bloque propio desde
   * el 16/9: antes los cuatro inputs del Pro solo alteraban la prosa de campos
   * que el free tambien recibe, asi que el usuario no tenia forma de saber que
   * le habia servido contestarlos. Medido con
   * `scripts/experimento-datos-pro.mjs`: el contenido existia (calculaba
   * unidades por presupuesto), pero vivia dentro de
   * `analisis_costo_proveedor.evaluacion`, sin nombre y sin envase.
   */
  analisis_avanzado?: {
    primera_compra?: {
      unidades: number;
      inversion_usd: number;
      costo_unitario_usd: number;
      detalle: string;
    } | null;
    importacion?: {
      costos_extra: string;
      tiempo_estimado: string;
      detalle: string;
    } | null;
    mix_variantes?: { variante: string; proporcion: string; razon: string }[] | null;
    plan_canal?: { titulo: string; detalle: string } | null;
  } | null;
  productos_alternativos?: {
    nombre: string;
    razon: string;
    nicho: 'específico' | 'adyacente' | 'segmento';
  }[];
  /**
   * Desglose del score, escrito por `lib/inngest-functions.ts` desde el TAB 3
   * (20/9). Ausente en todo analisis anterior a esa fecha: la UI tiene que
   * tratar `undefined` como "este analisis se corrio con la formula vieja" y
   * no mostrar el bloque, nunca como "el score no tiene componentes".
   *
   * Es la pieza que contesta "por que 62 y no 80", que es la diferencia entre
   * un numero que se cree y un numero que parece inventado. Ver
   * `lib/score.ts` para la formula y los pesos.
   */
  score_detalle?: {
    formula: string;
    score_bruto: number;
    puntos_obtenidos: number;
    puntos_posibles: number;
    componentes: import("./score").ComponenteScore[];
    omitidos: import("./score").ComponenteOmitido[];
    techo_aplicado: number | null;
    motivo_techo: string | null;
  } | null;
  /** Metricas crudas del scrape. Es la serie que consume el seguimiento del TAB 5. */
  metricas?: import("./score").MetricasScrape | null;
}

export interface AnalysisRow {
  id: string;
  user_id: string;
  producto: string;
  pais: "AR" | "MX" | "CO";
  costo_estimado: number;
  resultado_json: AnalysisResult;
  score: number;
  veredicto: Veredicto;
  created_at: string;
}
