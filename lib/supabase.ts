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
  analisis_restantes: number;
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
  estacionalidad: string;
  diferenciadores_oportunidad: string[];
  riesgos: string[];
  recomendacion: string;
  titulo_sugerido_publicacion: string;
  analisis_costo_proveedor: {
    rango_mayorista_estimado: string;
    evaluacion: string;
  };
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
  productos_alternativos?: {
    nombre: string;
    razon: string;
    nicho: 'específico' | 'adyacente' | 'segmento';
  }[];
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
