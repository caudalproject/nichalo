/**
 * Area de tendencias — TAB 7 (24/9/2026).
 *
 * POR QUE ESTE ARCHIVO NO LLAMA A GOOGLE
 *
 * La nota del TAB 7 daba por sentado que `/tendencias` podia leer Google
 * Trends en vivo. No puede. Verificado el 24/9 con llamadas reales: despues de
 * ~40 consultas en 15 minutos, Google deja de devolver JSON y devuelve HTML
 * (el parse muere con `Unexpected token 'L', "L><HEAD><m"`). No es falta de
 * datos — "auriculares" habia devuelto 7 resultados diez minutos antes.
 *
 * Seis nichos por cuatro productos son 24 consultas para pintar una sola
 * pagina. Con trafico real la seccion se rompe sola, y ademas dejaria el rate
 * limit de Google adentro del camino del usuario.
 *
 * Por eso los datos viven en `data/tendencias.json`, generado a mano por
 * `scripts/barrer-tendencias.mjs`. Servir esta seccion no hace **ninguna**
 * llamada de red: es el freno 1 del tab (costo marginal cero) llevado al
 * limite. El precio es que los datos son tan frescos como el ultimo barrido,
 * y por eso cada pagina muestra la fecha.
 *
 * LA LINEA QUE SOSTIENE EL PAYWALL
 *
 * Ningun tipo de este archivo tiene score, veredicto, margen ni precio de
 * equilibrio, y no es un olvido: es la regla que hace que el analisis pago
 * siga teniendo razon de ser. La tendencia dice QUE se busca; el analisis dice
 * si te conviene A VOS. Si algo de eso entra aca, la seccion gratis contesta
 * las dos preguntas y el pago queda sin sentido.
 */

/** Un termino relacionado, con su variacion en la ventana medida. */
export interface TerminoTendencia {
  termino: string;
  /** Formato de Google: "+150%", "Breakout". Se muestra tal cual. */
  variacion: string;
  /** Crudo, para ordenar. */
  valor: number;
}

/** Un punto de la serie de interes en el tiempo. */
export interface PuntoInteres {
  /** Etiqueta semanal de Google, ej "Sep 20 - 26, 2026". */
  fecha: string;
  /** 0-100, normalizado DENTRO de Argentina. Ver nota de comparabilidad. */
  valor: number;
}

export interface ProductoTendencia {
  /** El termino semilla con el que se consulto. */
  producto: string;
  /** rankedList[1] de Google: rising / breakout. */
  subiendo: TerminoTendencia[];
  /** rankedList[0] de Google: las relacionadas mas populares. */
  masBuscado: TerminoTendencia[];
  interes: PuntoInteres[];
  /**
   * Variacion entre las primeras 8 semanas y las ultimas 8, en porcentaje.
   * null si la serie no alcanza para calcularla.
   */
  variacionAnual: number | null;
}

export interface NichoTendencia {
  slug: string;
  nombre: string;
  descripcion: string;
  productos: ProductoTendencia[];
}

export interface DatosTendencias {
  /** ISO del momento del barrido. */
  generado: string;
  ventanaDias: number;
  geo: string;
  nichos: NichoTendencia[];
}

/**
 * Definicion de un nicho antes de tener datos. El barrido consume esto.
 *
 * VOCABULARIO (TAB 5.2, y corregido por JP el 24/9): **nicho = categoria**,
 * **producto = lo que se analiza**. "Tecnologia y audio" es un nicho;
 * "auriculares" es un producto de adentro. La primera version de este tab
 * confundio las dos cosas y proponia "auriculares" como nicho.
 *
 * POR QUE VARIOS PRODUCTOS POR NICHO, Y NO UNO
 *
 * No es cosmetico, resuelve un problema medido. Acotar la ventana de Google a
 * 12 meses es lo unico que hace que "Subiendo" discrimine (sin ventana, la
 * libreria consulta desde 2004 y **todo** vuelve "Breakout": contra 2004 todo
 * crecio +800.000%). Pero la ventana corta deja productos sin datos —
 * "accesorios para perros" devuelve vacio a 12 meses y a 90 dias.
 *
 * Con 4 productos por nicho, que uno vuelva vacio no deja la pagina en blanco.
 */
export interface DefinicionNicho {
  slug: string;
  nombre: string;
  descripcion: string;
  productos: string[];
}

export const NICHOS: DefinicionNicho[] = [
  {
    slug: "tecnologia-y-audio",
    nombre: "Tecnología y audio",
    descripcion:
      "Auriculares, parlantes, relojes inteligentes y accesorios de celular.",
    productos: ["auriculares", "parlante bluetooth", "smartwatch", "cargador portatil"],
  },
  {
    slug: "running-y-fitness",
    nombre: "Running y fitness",
    descripcion:
      "Zapatillas, equipamiento para entrenar en casa y suplementos deportivos.",
    // "mancuernas" se cambio por "bicicleta fija" el 24/9: devolvia 4 de 4
    // RUTINAS y ningun producto ("goblet squat", "press militar sentado con
    // mancuernas"). El aparato de gimnasio que mas se busca es tambien el que
    // mas contenido de entrenamiento arrastra.
    productos: ["zapatillas running", "bicicleta fija", "cinta de correr", "proteina whey"],
  },
  {
    slug: "mascotas",
    nombre: "Mascotas",
    descripcion: "Alimento, arena, correas, cuchas y accesorios para perros y gatos.",
    // Semillas cambiadas el 24/9 tras el primer barrido. Las originales
    // ("accesorios para perros", "comedero para perros", "juguetes para
    // perros", "rascador para gatos") devolvieron **0 terminos en Subiendo en
    // las cuatro**, y no era el filtro: "accesorios para perros" vuelve vacio
    // de Google a 12 meses y a 90 dias. Es volumen de busqueda insuficiente
    // para que Google calcule rising. Se reemplazan por consultas mas
    // masivas del mismo nicho.
    productos: ["alimento para perros", "arena para gatos", "correa para perros", "cucha para perros"],
  },
  {
    slug: "cocina-y-electro",
    nombre: "Cocina y electro chico",
    descripcion:
      "Freidoras de aire, cafeteras, licuadoras y electrodomésticos de mesada.",
    productos: ["freidora de aire", "licuadora", "pava electrica", "cafetera"],
  },
  {
    slug: "belleza-y-cuidado-personal",
    nombre: "Belleza y cuidado personal",
    descripcion: "Perfumes, secadores, planchitas y cuidado de la piel.",
    productos: ["perfume", "secador de pelo", "planchita de pelo", "crema facial"],
  },
  {
    slug: "hogar-y-organizacion",
    nombre: "Hogar y organización",
    descripcion: "Muebles chicos, escritorios, sillas y soluciones de orden.",
    // "escritorio" a secas es ambiguo entre el mueble y el desktop de una
    // computadora: devolvia "google drive para escritorio" y "acceso remoto
    // escritorio remoto de chrome". Se acota a la acepcion de mueble.
    productos: ["silla gamer", "escritorio gamer", "estanteria", "organizador de cables"],
  },
];

export function buscarDefinicion(slug: string): DefinicionNicho | undefined {
  return NICHOS.find((n) => n.slug === slug);
}

/**
 * Convierte la variacion anual en una frase corta.
 *
 * Deliberadamente vaga en la magnitud: describe la CURVA DE BUSQUEDA, no la
 * conveniencia de vender. "Se busca mas que hace un año" es un hecho de
 * Google; "conviene" seria un veredicto, y el veredicto es del analisis pago.
 */
export function describirInteres(variacion: number | null): string {
  if (variacion === null) return "Sin serie suficiente para comparar";
  if (variacion >= 25) return "Se busca bastante más que hace un año";
  if (variacion >= 8) return "Se busca algo más que hace un año";
  if (variacion > -8) return "Se busca parecido a hace un año";
  if (variacion > -25) return "Se busca algo menos que hace un año";
  return "Se busca bastante menos que hace un año";
}

/** Link al analisis con el producto precargado. `/analizar` ya lee `producto`. */
export function linkAnalizar(termino: string): string {
  return `/analizar?producto=${encodeURIComponent(termino)}`;
}
