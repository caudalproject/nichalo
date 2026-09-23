/**
 * TAB 5.1 — CUANDO se manda el mail del nicho, y sobre todo cuando NO.
 *
 * Este archivo no importa Supabase, ni Resend, ni lee el reloj del sistema:
 * `ahora` se pasa como argumento. Esta separado del envio (lib/notificar-
 * seguimiento.ts) porque la decision es la parte que hay que poder probar sin
 * base de datos ni API key — y porque el primer intento, con todo junto, no se
 * podia correr en scripts/validar-notificacion.mjs sin credenciales de
 * produccion. Un archivo que solo se puede probar en produccion no se prueba.
 *
 * LA DECISION QUE VIVE ACA ES EL SILENCIO.
 *
 * Un mail semanal que dice "no cambio nada" entrena al usuario a archivarlo sin
 * abrir, y despues el unico que importaba llega al mismo lugar. El TAB 5 dejo
 * `hay_cambios_materiales` en lib/delta.ts justamente para esto: false si
 * ningun cambio supera el umbral (precio +-5%, vendedores >=2, listings >=3).
 * Debajo de eso es ruido del scrape, no mercado.
 */

import { formatearValor, type Delta } from "./delta";

/** Cuatro semanas sin novedades y sale un resumen. Uno solo. */
export const DIAS_RESUMEN = 28;

export type Decision =
  | { notificar: false; motivo: string }
  | { notificar: true; tipo: "cambios" | "resumen"; motivo: string };

export interface FilaMail {
  etiqueta: string;
  antes: string;
  ahora: string;
  /** Define el color: verde si el cambio favorece al que quiere vender. Sale de
   *  `bueno_si` del delta, no del signo — mas vendedores es un numero que sube
   *  y una noticia que empeora. */
  tono: "bueno" | "malo" | "neutro";
}

export function decidirNotificacion(args: {
  origen: string;
  delta: Delta | null;
  /** Ultima vez que se le escribio al usuario POR ESTE NICHO. */
  ultimaNotificacionAt: string | null;
  /** Desde cuando se vigila. Es la referencia del resumen si nunca se notifico. */
  vigiladoDesde: string;
  ahora: Date;
}): Decision {
  // 1. El re-chequeo manual no manda mail. El usuario apreto el boton y esta
  //    mirando la pantalla: el mail llegaria mientras lee el resultado.
  if (args.origen !== "cron") {
    return { notificar: false, motivo: "la corrida no es del cron" };
  }

  // 2. Sin medicion anterior no hay delta, y sin delta no hay nada que contar.
  //    Es el caso de la primera corrida de un nicho recien agregado.
  if (!args.delta) {
    return { notificar: false, motivo: "es la primera medicion del nicho" };
  }

  // 3. El caso que justifica la feature.
  if (args.delta.hay_cambios_materiales) {
    return { notificar: true, tipo: "cambios", motivo: "hay cambios materiales" };
  }

  // 4. Nada material. Solo se rompe el silencio si hace cuatro semanas que no
  //    se le escribe — y la referencia es la ultima vez que SE MANDO un mail,
  //    no la ultima medicion: si la semana pasada se le aviso de un cambio, el
  //    usuario ya sabe que la vigilancia funciona.
  const referencia = args.ultimaNotificacionAt ?? args.vigiladoDesde;
  const dias = (args.ahora.getTime() - new Date(referencia).getTime()) / 86_400_000;

  if (dias >= DIAS_RESUMEN) {
    return {
      notificar: true,
      tipo: "resumen",
      motivo: `${Math.round(dias)} dias sin novedades`,
    };
  }

  return {
    notificar: false,
    motivo: `sin cambios materiales y solo ${Math.round(dias)} dias desde el ultimo aviso`,
  };
}

/**
 * Las filas que entran al mail: las materiales y con dato en las dos corridas.
 *
 * El delta calcula once campos; el mail muestra los que superaron el umbral. El
 * resto esta en la pantalla. Un mail con once filas donde nueve dicen "igual"
 * es un mail que ensena a ignorar los mails.
 */
export function filasDelMail(delta: Delta): FilaMail[] {
  return delta.cambios
    .filter((c) => c.material && !c.sin_dato)
    .map((c) => ({
      etiqueta: c.etiqueta,
      antes: formatearValor(c.antes, c.formato),
      ahora: formatearValor(c.ahora, c.formato),
      tono:
        c.bueno_si === "neutro" || c.direccion === "igual"
          ? ("neutro" as const)
          : c.bueno_si === c.direccion
            ? ("bueno" as const)
            : ("malo" as const),
    }));
}
