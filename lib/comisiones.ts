/**
 * Comisiones de Mercado Libre — calculadas en codigo, no pedidas al modelo.
 *
 * Motivo (TAB 3, 20/9): el margen neto es el 40% del score nuevo, y el margen
 * depende de la comision. Mientras la comision la calculara Gemini a partir de
 * una tabla escrita en prosa dentro del prompt, el score seguia siendo
 * parcialmente no reproducible: el mismo producto con el mismo precio podia
 * salir con 12,40% o con 15,40% segun que categoria estimara el modelo esa
 * corrida. Sacarlo del prompt no solo lo vuelve determinista, ademas borra
 * ~40 lineas de tabla del prompt.
 *
 * La tabla es la misma que estaba en `buildPrompt` (datos reales 2026), movida
 * sin cambiarle un numero. La unica pieza nueva es `categoriaDesdeProducto`.
 *
 * NOTA SOBRE LA CATEGORIA: el matcher por palabras clave es grosero a
 * proposito. Para Argentina —el unico pais que opera hoy— en CLASICA las siete
 * categorias cobran 12,40%, asi que para el perfil principiante la categoria
 * es irrelevante y el riesgo de equivocarla es cero. Solo importa en PREMIUM
 * (intermedio/experto), donde va de 12,40% a 16,57%. Ante la duda cae en
 * "Resto", que en PREMIUM AR es 15,40% — el lado conservador: sobreestimar la
 * comision baja el margen y baja el score. Nunca infla una oportunidad.
 *
 * ---------------------------------------------------------------------------
 * VERIFICACION DE TASAS (TAB 3.4, 1/10/2026): **NO VERIFICADAS CONTRA FUENTE
 * OFICIAL.**
 *
 * Se intento contra la pagina oficial de costos de vender de ML Argentina
 * (mercadolibre.com.ar/ayuda/costos-de-vender-un-producto_870 y
 * vendedores.mercadolibre.com.ar): las dos devuelven 403 a un fetch
 * automatico. Las fuentes de terceros consultadas ese dia se contradicen
 * entre si y con esta tabla:
 *   - Comision: 11,8% a 17,14% segun categoria y provincia (Tienda Neolo,
 *     Algoritmo Digital). Clasica 12,4% plano queda adentro del rango.
 *   - CARGO FIJO — DISCREPANCIA ABIERTA: Algoritmo Digital (act. 1/9/2026)
 *     da ~$1.115 a ~$2.810 por unidad hasta ~$33.000 y $0 arriba. Esta tabla
 *     cobra $2.500 bajo $33.000 y $4.000 entre $33.000 y $60.000. Si los
 *     terceros tienen razon, hoy SOBREESTIMAMOS el cargo fijo en tickets
 *     bajos y en el tramo 33k-60k (error del lado conservador: baja el margen).
 * No se cambio ningun numero con datos no oficiales. Pendiente: JP copia la
 * tabla de "Costos de venta" de su cuenta de vendedor y se actualiza aca con
 * la fecha.
 */

export type PaisML = "AR" | "MX" | "CO";
export type TipoPublicacion = "clasica" | "premium";

export type CategoriaML =
  | "Electrónica/tecnología"
  | "Electrodomésticos"
  | "Ropa y accesorios"
  | "Deportes y fitness"
  | "Hogar y jardín"
  | "Juguetes"
  | "Resto";

interface TablaPais {
  nombre: string;
  clasica: { categorias: Record<CategoriaML, number>; cargoFijo: (precio: number) => number };
  premium: { categorias: Record<CategoriaML, number>; cargoFijo: (precio: number) => number };
}

export const COMISIONES: Record<PaisML, TablaPais> = {
  AR: {
    nombre: "Argentina",
    clasica: {
      categorias: {
        "Electrónica/tecnología": 12.4,
        "Electrodomésticos": 12.4,
        "Ropa y accesorios": 12.4,
        "Deportes y fitness": 12.4,
        "Hogar y jardín": 12.4,
        "Juguetes": 12.4,
        "Resto": 12.4,
      },
      cargoFijo: (p) => (p < 33000 ? 2500 : p < 60000 ? 4000 : 0),
    },
    premium: {
      categorias: {
        "Electrónica/tecnología": 13.9,
        "Electrodomésticos": 12.4,
        "Ropa y accesorios": 16.57,
        "Deportes y fitness": 15.4,
        "Hogar y jardín": 15.4,
        "Juguetes": 15.4,
        "Resto": 15.4,
      },
      cargoFijo: (p) => (p < 33000 ? 2500 : p < 60000 ? 4000 : 0),
    },
  },
  MX: {
    nombre: "México",
    clasica: {
      categorias: {
        "Electrónica/tecnología": 10,
        "Electrodomésticos": 10,
        "Ropa y accesorios": 16,
        "Deportes y fitness": 14,
        "Hogar y jardín": 15,
        "Juguetes": 14,
        "Resto": 13,
      },
      cargoFijo: (p) => (p < 99 ? 25 : p < 199 ? 30 : p < 299 ? 37 : 0),
    },
    premium: {
      categorias: {
        "Electrónica/tecnología": 13.5,
        "Electrodomésticos": 13.5,
        "Ropa y accesorios": 20.5,
        "Deportes y fitness": 17,
        "Hogar y jardín": 18,
        "Juguetes": 17,
        "Resto": 16.5,
      },
      cargoFijo: () => 0,
    },
  },
  CO: {
    nombre: "Colombia",
    clasica: {
      categorias: {
        "Electrónica/tecnología": 10,
        "Electrodomésticos": 10,
        "Ropa y accesorios": 15,
        "Deportes y fitness": 13,
        "Hogar y jardín": 14,
        "Juguetes": 13,
        "Resto": 13,
      },
      cargoFijo: (p) => (p < 50000 ? 1500 : 0),
    },
    premium: {
      categorias: {
        "Electrónica/tecnología": 13,
        "Electrodomésticos": 13,
        "Ropa y accesorios": 18,
        "Deportes y fitness": 16,
        "Hogar y jardín": 16,
        "Juguetes": 16,
        "Resto": 15,
      },
      cargoFijo: () => 0,
    },
  },
};

/**
 * OTROS COSTOS DE VENTA — default 10% del precio (TAB 3.4, OK de JP 1/10/2026).
 *
 * La comision + cargo fijo no es todo lo que ML le saca al vendedor. Un
 * vendedor real (DM del 1/10) reporta 27% de costos totales; con solo la
 * comision Nichalo asumia ~15% y el margen salia inflado ~12 puntos, que es
 * justo lo que produce VIABLE falsos (el error caro: le dice a alguien que
 * compre stock).
 *
 * Composicion del 10% (ESTIMACIONES, no tasas oficiales):
 *   ~6%  envio a cargo del vendedor. Envio gratis obligatorio arriba del
 *        umbral, con una parte bonificada que paga el vendedor. Va como %
 *        plano: calcular por peso y CP quedo fuera del tab.
 *   ~3%  retenciones de Ingresos Brutos (SIRCREB y similares). Van de ~1,5% a
 *        ~5% segun provincia; para un monotributista no se recuperan.
 *   ~1%  colchon para devoluciones y promociones.
 *    0%  cuotas: en Premium ya estan dentro de la comision (por eso cobra mas);
 *        Clasica no ofrece cuotas sin interes. Sumarlas seria contarlas dos
 *        veces.
 * Afuera a proposito: IVA y Ganancias (dependen de la situacion fiscal de
 * cada vendedor; el perfil principiante se asume monotributista).
 *
 * Ancla: 27% (vendedor real) - Premium tipica 15,4% - cargo fijo ≈ 10-11.
 * Medido en el golden set (1/10): con 10% cambian 3 veredictos, los tres
 * hacia abajo. Si llega un desglose real, se reemplaza este numero.
 *
 * El usuario lo puede editar en el formulario. Se acota a [0, 50]: arriba de
 * eso es un error de tipeo, no un costo.
 */
export const OTROS_COSTOS_DEFAULT_PCT = 10;
export const OTROS_COSTOS_MAX_PCT = 50;

export function normalizarOtrosCostosPct(v: unknown): number {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) {
    return OTROS_COSTOS_DEFAULT_PCT;
  }
  return Math.min(OTROS_COSTOS_MAX_PCT, Math.max(0, Math.round(n * 10) / 10));
}

export function esTipoPublicacion(v: unknown): v is TipoPublicacion {
  return v === "clasica" || v === "premium";
}

/** El perfil define el tipo de publicacion. Ya era asi en el prompt. */
export function tipoPublicacionPorPerfil(perfil: string): TipoPublicacion {
  return perfil === "principiante" ? "clasica" : "premium";
}

/**
 * Orden importa: la primera regla que matchea gana. Las mas especificas van
 * primero (una "camiseta deportiva" es Ropa, no Deportes).
 */
const REGLAS_CATEGORIA: Array<[CategoriaML, RegExp]> = [
  [
    "Ropa y accesorios",
    /\b(camiseta|remera|campera|buzo|pantalon|jean|short|vestido|zapatilla|zapato|gorra|medias?|ropa|abrigo|calza|bikini|malla|mochila|cartera|billetera|cinturon|reloj pulsera)\b/i,
  ],
  [
    "Electrodomésticos",
    /\b(licuadora|batidora|cafetera|tostadora|microondas|heladera|lavarropas|lavadora|secarropas|aspiradora|ventilador|aire acondicionado|calefactor|estufa|freidora|airfryer|pava electrica|horno|plancha)\b/i,
  ],
  [
    "Electrónica/tecnología",
    /\b(auricular|airpods|celular|smartphone|notebook|laptop|tablet|monitor|teclado|mouse|parlante|bluetooth|cargador|cable|usb|camara|smartwatch|consola|placa de video|router|led|iphone|samsung|xiaomi|impresora|disco|ssd|pendrive)\b/i,
  ],
  [
    "Deportes y fitness",
    /\b(mancuerna|pesa|colchoneta|yoga|bicicleta|rodillo|cinta de correr|gimnasio|fitness|pelota|futbol|rugby|tenis|natacion|proteina|suplemento|banda elastica)\b/i,
  ],
  [
    "Juguetes",
    /\b(juguete|muñeca|peluche|lego|rompecabezas|puzzle|juego de mesa|didactico|bebe juego|autito|pista)\b/i,
  ],
  [
    "Hogar y jardín",
    /\b(lampara|silla|mesa|sillon|escritorio|almohada|colchon|sabana|acolchado|cortina|organizador|estante|maceta|manguera|jardin|tender|cocina|olla|sarten|vaso|termo|mate|cuadro|decoracion|toalla|percha|cesto)\b/i,
  ],
];

export function categoriaDesdeProducto(producto: string): CategoriaML {
  const limpio = producto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [categoria, re] of REGLAS_CATEGORIA) {
    if (re.test(limpio)) return categoria;
  }
  return "Resto";
}

export interface ComisionCalculada {
  tipo_publicacion: "Clásica" | "Premium";
  categoria: CategoriaML;
  porcentaje: number;
  cargo_fijo: number;
  /** porcentaje sobre el precio + cargo fijo, en moneda local. */
  monto_total: number;
}

export function calcularComision(args: {
  pais: PaisML;
  perfil: string;
  producto: string;
  precio: number;
  /** Elegido por el usuario (TAB 3.4). Sin el, sale del perfil como antes. */
  tipo?: TipoPublicacion | null;
}): ComisionCalculada {
  const { pais, perfil, producto, precio } = args;
  const tabla = COMISIONES[pais] ?? COMISIONES.AR;
  const tipo = esTipoPublicacion(args.tipo) ? args.tipo : tipoPublicacionPorPerfil(perfil);
  const bloque = tipo === "clasica" ? tabla.clasica : tabla.premium;
  const categoria = categoriaDesdeProducto(producto);
  const porcentaje = bloque.categorias[categoria];
  const cargoFijo = precio > 0 ? bloque.cargoFijo(precio) : 0;
  const monto = precio > 0 ? Math.round((precio * porcentaje) / 100) + cargoFijo : 0;

  return {
    tipo_publicacion: tipo === "clasica" ? "Clásica" : "Premium",
    categoria,
    porcentaje,
    cargo_fijo: cargoFijo,
    monto_total: monto,
  };
}

/**
 * Todo lo que se descuenta del precio antes del costo del producto (TAB 3.4):
 * comision + cargo fijo + otros costos de venta. Es lo que el margen tiene que
 * restar y lo que la pagina de resultado desglosa.
 */
export interface CostosDeVenta {
  comision: ComisionCalculada;
  /** "usuario" si lo eligio en el formulario; "perfil" si se asumio. */
  tipo_elegido_por: "usuario" | "perfil";
  otros_pct: number;
  otros_monto: number;
  /** comision.monto_total + otros_monto, en moneda local. */
  monto_total: number;
  /** monto_total sobre el precio, en %. */
  total_pct: number;
}

export function calcularCostosDeVenta(args: {
  pais: PaisML;
  perfil: string;
  producto: string;
  precio: number;
  tipo?: TipoPublicacion | null;
  otrosPct: number;
}): CostosDeVenta {
  const comision = calcularComision(args);
  const otrosMonto = args.precio > 0 ? Math.round((args.precio * args.otrosPct) / 100) : 0;
  const total = comision.monto_total + otrosMonto;
  return {
    comision,
    tipo_elegido_por: esTipoPublicacion(args.tipo) ? "usuario" : "perfil",
    otros_pct: args.otrosPct,
    otros_monto: otrosMonto,
    monto_total: total,
    total_pct: args.precio > 0 ? Math.round((total / args.precio) * 1000) / 10 : 0,
  };
}
