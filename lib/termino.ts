/**
 * Con que se busca en Mercado Libre (24/9/2026).
 *
 * POR QUE EXISTE
 *
 * Hasta hoy la route hacia esto:
 *
 *     if (identificado?.termino_busqueda) searchKeyword = identificado.termino_busqueda;
 *
 * Una asignacion, sin una sola validacion. Lo que el modelo devolvia mirando
 * la foto REEMPLAZABA lo que el usuario habia escrito, aunque hablara de otra
 * cosa.
 *
 * EL CASO QUE LO ROMPIO (analisis 47535fd3, 24/9). El usuario pego el titulo
 * completo del listing que queria validar:
 *
 *     "Aspiradora inalambrica mini de alta potencia para hogar y automovil"
 *
 * y adjunto la foto. El modelo devolvio "mini aspiradora soplador portatil".
 * Metio "soplador" — que en Mercado Libre es otra categoria entera,
 * sopladores de hojas de jardin de $87.000 a $123.000 — y tiro "inalambrica"
 * y "automovil". Se scrapeo un mercado que el usuario nunca pidio, los
 * precios salieron de $11.999 a $123.470, ratio p90/p10 de 8,4, confianza
 * baja, score capeado en 60.
 *
 * La foto existe para ANGOSTAR la busqueda. Termino ensanchandola.
 *
 * LA REGLA
 *
 * La foto puede elegir entre las palabras del usuario y puede agregar
 * precision cuando el usuario fue vago. No puede introducir un sustantivo que
 * el usuario no escribio cuando el usuario ya fue especifico. Dicho de una
 * forma que se le puede prometer a alguien: **Nichalo no busca una categoria
 * que vos no nombraste.**
 *
 * QUE NO HACE
 *
 * No toca la FICHA. La ficha describe que es el producto y la usa
 * `verificarPertenencia` para decidir publicacion por publicacion; no dispara
 * ningun scrape, asi que no puede ensanchar nada. Un termino rechazado no
 * invalida la ficha que vino con el.
 */

import { palabrasContenido, esModificador, coincide } from "./relevancia";

/**
 * Desde cuantas palabras con contenido se considera que el usuario ya dijo
 * exactamente que queria validar.
 *
 * Abajo de esto, la foto tiene trabajo real que hacer: alguien que escribe
 * "aspiradora" necesita que la imagen aclare si es de mano, robot o de
 * trineo, y bloquear ese aporte devolveria el problema original — buscar una
 * categoria entera.
 *
 * Desde 4 palabras, la foto no tiene nada que agregar y todo que romper: el
 * usuario ya acoto el producto y cualquier sustantivo nuevo solo puede mover
 * la busqueda a otro lado.
 */
const CONSULTA_ESPECIFICA = 4;

/** Cuantos modificadores del usuario entran en el termino recortado. */
const MAX_MODIFICADORES = 2;

/** Tope duro de palabras. Mercado Libre degrada con consultas largas. */
const MAX_PALABRAS = 5;

export type OrigenTermino =
  | "modelo"
  | "usuario_recortado"
  | "modelo_rechazado_sustantivo_nuevo"
  | "modelo_rechazado_sin_nucleo";

export interface TerminoResuelto {
  /** Con esto se scrapea. */
  termino: string;
  origen: OrigenTermino;
  /** La palabra que hizo rechazar el termino del modelo, si hubo. */
  palabra_intrusa?: string;
}

/**
 * Recorta el texto del usuario a algo que Mercado Libre pueda buscar bien.
 *
 * Conserva el orden original y todas las palabras que dicen QUE es el
 * producto, mas hasta `MAX_MODIFICADORES` de las que dicen COMO es. Una
 * consulta de nueve palabras le devuelve a ML resultados peores que una de
 * tres, asi que recortar no es una concesion: es lo que hay que hacer.
 */
function recortar(palabras: string[]): string {
  if (palabras.length <= 3) return palabras.join(" ");

  const elegidas: string[] = [];
  let modificadores = 0;

  for (const palabra of palabras) {
    if (elegidas.length >= MAX_PALABRAS) break;
    if (esModificador(palabra)) {
      if (modificadores >= MAX_MODIFICADORES) continue;
      modificadores++;
    }
    elegidas.push(palabra);
  }

  return elegidas.join(" ");
}

/**
 * Decide el termino de busqueda final.
 *
 * @param producto       lo que tipeo el usuario. Es la autoridad.
 * @param terminoModelo  lo que devolvio la foto. Es una propuesta.
 */
export function resolverTerminoBusqueda(args: {
  producto: string;
  terminoModelo?: string | null;
  /**
   * Reintento por confianza baja. Baja `CONSULTA_ESPECIFICA` a 1, o sea: la
   * foto no puede introducir un sustantivo nuevo por corto que sea el texto
   * del usuario.
   *
   * POR QUE. Un reintento existe porque el analisis anterior no sirvio, y en
   * el camino que nos interesa lo que no sirvio fue el termino. La foto ya
   * tuvo su oportunidad con este producto y la desaprovecho; darle otra vez
   * permiso para cambiar el sustantivo es apostar a que la segunda lectura de
   * la MISMA foto salga distinta. Los modificadores se siguen aceptando: no
   * pueden mover la busqueda de categoria.
   */
  estricto?: boolean;
}): TerminoResuelto {
  const { producto, terminoModelo, estricto } = args;

  const palabrasUsuario = palabrasContenido(producto);
  const nucleoUsuario = palabrasUsuario.filter((p) => !esModificador(p));
  const recortado = recortar(palabrasUsuario);

  if (!terminoModelo || !terminoModelo.trim()) {
    return { termino: recortado || producto, origen: "usuario_recortado" };
  }

  const palabrasModelo = palabrasContenido(terminoModelo);
  if (palabrasModelo.length === 0) {
    return { termino: recortado || producto, origen: "usuario_recortado" };
  }

  // CERCO 1 — el termino tiene que seguir hablando del producto del usuario.
  //
  // Corre SIEMPRE, incluso con consultas vagas. Si el usuario escribio
  // "aspiradora" y el modelo devuelve "soplador de hojas", no hay nada que
  // discutir: la foto se leyo mal o es de otra cosa, y el texto gana.
  //
  // Si el usuario no escribio ningun sustantivo (todo modificadores) no hay
  // nucleo contra que chequear y el cerco no se aplica: no se puede exigir
  // que se conserve algo que no existe.
  if (nucleoUsuario.length > 0) {
    const conserva = palabrasModelo.some((m) =>
      nucleoUsuario.some((n) => coincide(n, m))
    );
    if (!conserva) {
      return {
        termino: recortado || producto,
        origen: "modelo_rechazado_sin_nucleo",
      };
    }
  }

  // CERCO 2 — con el usuario ya especifico, la foto no agrega sustantivos.
  //
  // Es el que hubiera frenado "soplador". Solo mira sustantivos: que la foto
  // aporte "inalambrica" o "portatil" es precision y se acepta, porque un
  // modificador no puede mudar la busqueda de categoria.
  const umbralEspecifico = estricto ? 1 : CONSULTA_ESPECIFICA;
  if (palabrasUsuario.length >= umbralEspecifico) {
    const intrusa = palabrasModelo.find(
      (m) => !esModificador(m) && !palabrasUsuario.some((u) => coincide(u, m))
    );
    if (intrusa) {
      return {
        termino: recortado || producto,
        origen: "modelo_rechazado_sustantivo_nuevo",
        palabra_intrusa: intrusa,
      };
    }
  }

  return { termino: terminoModelo.trim(), origen: "modelo" };
}
