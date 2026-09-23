/**
 * Acto 3 — "Que hacer": el numero con el que el usuario se va de la pagina.
 * TAB 4.1 del plan de tabs (21/9/2026).
 *
 * POR QUE EXISTE
 *
 * Hasta la formula v1.1 (TAB 3.1, 21/9) un veredicto SATURADO era un callejon
 * sin salida: la pagina decia "no da" y ahi terminaba. Los dos primeros
 * usuarios reales del producto recibieron los dos un 20/100 y se fueron.
 *
 * La v1.1 agrego `precioDeEquilibrio()` — el precio al que el margen cruza
 * cero, resuelto por biseccion porque la comision de Mercado Libre tiene
 * tramos y cargo fijo. Con eso el acto 3 SIEMPRE tiene un numero que dar:
 *
 *   - margen negativo → "a partir de $X empezas a ganar"
 *   - margen positivo → "publica a $X y te quedan $Y por unidad"
 *
 * OJO CON EL NUMERO (esto no es opcional)
 *
 * Hasta el 21/9 el calculo NO distinguia unidad de venta: un pack x3 se
 * comparaba contra el scrape de unidades sueltas. El caso vivo fue el analisis
 * del 21/9 — costo de un pack de 3 rollos ($150.000) contra una mediana de
 * rollos sueltos ($62.980), margen −1375%.
 *
 * **El TAB 3.2 (22/9) lo arreglo en el pipeline** (`lib/unidad.ts`): costo y
 * precios se llevan a base "una unidad" antes de calcular nada. Desde entonces
 * el analisis trae `score_detalle.unidad` con lo que efectivamente se hizo, y
 * esta tarjeta deja de adivinar: informa.
 *
 * Igual el precio de equilibrio NUNCA se muestra pelado. La normalizacion solo
 * corrige lo que el titulo DECLARA — un pack que no se anuncia como pack sigue
 * sin detectarse. La linea de "sobre que unidad esta calculado" se queda, con
 * tres redacciones segun lo que se sepa. Un numero equivocado dicho con
 * seguridad es peor que no dar numero: es exactamente la clase de dato
 * inventado que el bloque del desglose existe para desmentir.
 */

import type { UnidadDeVenta } from "@/lib/unidad";

/**
 * Heuristica, no deteccion. Se usa SOLO como respaldo para los analisis
 * anteriores al 22/9, que no traen `score_detalle.unidad`. Para todo lo nuevo
 * manda el dato real que dejo `lib/unidad.ts`.
 *
 * Falsos negativos de sobra (un pack puede no decirlo) y algun falso positivo
 * ("kit de limpieza" que se vende como kit en los dos lados, donde la
 * comparacion esta bien). Solo decide el TONO de una advertencia que se muestra
 * igual en los dos casos, asi que equivocarse no rompe nada.
 */
function pareceUnPack(producto: string): boolean {
  return /\b(pack|combo|kit|set\s+de|docena|bulto|mayorista)\b|\bx\s?\d{1,2}\b|\b\d{1,2}\s?(u|un|unidades|pares)\b/i.test(
    producto,
  );
}

export function QueHacer({
  producto,
  margenBruto,
  bajaConfianza,
  equilibrioDisponible,
  precioEquilibrio,
  margenMedianaPct,
  precioMediana,
  precioSugerido,
  gananciaLocal,
  formatear,
  unidad,
}: {
  producto: string;
  margenBruto: number;
  bajaConfianza: boolean;
  /**
   * Si este analisis se corrio con una version que YA persistia el precio de
   * equilibrio. Sin este flag, `precioEquilibrio == null` es ambiguo y se
   * lee mal de la peor manera posible: los analisis viejos (que son todos los
   * que hay en la base al 21/9) recibirian el cartel de "no hay precio que
   * cierre", que es una afirmacion fuerte y falsa sobre un numero que
   * simplemente no se guardo.
   */
  equilibrioDisponible: boolean;
  /** En moneda local. `undefined` = analisis anterior al 21/9. `null` = no aplica o no existe. */
  precioEquilibrio?: number | null;
  margenMedianaPct?: number | null;
  precioMediana?: number | null;
  precioSugerido: number;
  /** Ganancia por unidad ya formateada, o null si la confianza no la sostiene. */
  gananciaLocal: string | null;
  formatear: (n: number) => string;
  /**
   * Lo que hizo la normalizacion del TAB 3.2. `undefined`/`null` = el analisis
   * es anterior al 22/9 y no hay dato: se cae a la heuristica vieja.
   */
  unidad?: UnidadDeVenta | null;
}) {
  const enPerdida = margenBruto < 0;
  // Tres estados, y el orden importa: el dato real le gana a la heuristica.
  //   "normalizado" — corrio el 3.2 y encontro packs: se corrigio de verdad.
  //   "verificado"  — corrio el 3.2 y no habia packs en ningun lado.
  //   "sospecha"    — analisis viejo sin dato; solo queda adivinar por el texto.
  const estadoUnidad: "normalizado" | "verificado" | "sospecha" | "limpio" = unidad
    ? unidad.aplicada
      ? "normalizado"
      : "verificado"
    : pareceUnPack(producto)
      ? "sospecha"
      : "limpio";
  // Ambar = "el numero puede estar mal". Eso vale para "sospecha" y NO para
  // "normalizado": ahi el problema ya se corrigio, y pintarlo de alarma le
  // diria al usuario que desconfie de un numero que justamente es el bueno.
  const esPack = estadoUnidad === "sospecha";

  // Con confianza baja no se afirma ningun precio: los datos que alimentan el
  // calculo son los mismos que el aviso de arriba acaba de marcar como
  // sospechosos. Dar un numero igual seria contradecir la pantalla propia.
  if (bajaConfianza) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Sin numero que dar todavia
        </p>
        <p className="mt-2 text-sm text-[#0A0A0A]">
          Los precios que trajimos de Mercado Libre no sostienen un calculo de
          equilibrio. Corregi el costo o volve a correr el analisis y este
          bloque te da el precio exacto.
        </p>
        {/* La pista mas util que tenemos para este caso. Cuando el producto
            parece un pack Y la confianza bajo por dispersion de precios, la
            causa mas probable de las dos cosas es la misma: el scrape junto
            packs con unidades sueltas. Decirlo aca le da al usuario algo que
            corregir, en vez de dejarlo con un "volve a intentar" a ciegas. */}
        {esPack && (
          <p className="mt-2 text-sm text-[#854D0E]">
            <strong className="font-semibold">Una pista:</strong> tu producto
            parece venderse por pack. Si el mercado lista la unidad suelta,
            estamos comparando tu costo de varias unidades contra el precio de
            una — probá de nuevo con el termino de una sola unidad.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="px-4 py-6 sm:px-6">
        {enPerdida ? (
          precioEquilibrio != null ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                Tu precio de equilibrio
              </p>
              <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-[#0A0A0A] sm:text-4xl">
                {formatear(precioEquilibrio)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#374151]">
                Por debajo de ese precio vendes a perdida una vez descontada la
                comision de Mercado Libre y tu costo. A partir de ahi, empezas a
                ganar.
              </p>
              {margenMedianaPct != null && margenMedianaPct > 0 && precioMediana != null && (
                <p className="mt-3 rounded-lg bg-[#F0FDF4] px-3 py-2 text-sm text-[#166534]">
                  <strong className="font-semibold">El mercado ya paga mas que eso.</strong>{" "}
                  La mediana esta en {formatear(precioMediana)} — vendiendo ahi tu
                  margen es {margenMedianaPct}%.
                </p>
              )}
            </>
          ) : !equilibrioDisponible ? (
            <>
              {/* Analisis corrido antes de que el precio de equilibrio se
                  persistiera (TAB 4.1, 21/9). El numero no existe en la base:
                  no se puede recalcular aca porque hace falta el perfil de
                  vendedor, que no viaja en resultado_json. Se dice lo que
                  sabemos y no mas que eso. */}
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                A este precio, perdes plata
              </p>
              <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-[#DC2626] sm:text-4xl">
                {formatear(precioSugerido)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#374151]">
                Es el precio de entrada de este nicho y a ese valor la operacion
                da negativo despues de la comision. Este analisis es anterior al
                calculo del precio de equilibrio: corrélo de nuevo y te decimos
                exactamente a partir de que precio empezas a ganar.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                No hay precio que cierre
              </p>
              <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-[#DC2626] sm:text-4xl">
                {formatear(precioSugerido)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#374151]">
                Es el precio de entrada de este nicho y a ese valor perdes plata.
                Con tu costo actual no encontramos ningun precio que deje
                ganancia despues de la comision: el camino es bajar el costo, no
                subir el precio.
              </p>
            </>
          )
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Publica a este precio
            </p>
            <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-[#16A34A] sm:text-4xl">
              {formatear(precioSugerido)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#374151]">
              {gananciaLocal ? (
                <>
                  Te quedan <strong className="font-semibold">{gananciaLocal}</strong> por
                  unidad despues de la comision de Mercado Libre y de tu costo —
                  un margen de {margenBruto.toFixed(1)}%.
                </>
              ) : (
                <>Un margen de {margenBruto.toFixed(1)}% despues de la comision y del costo.</>
              )}
            </p>
            {precioEquilibrio != null && (
              <p className="mt-3 text-sm text-[#6B7280]">
                Tu piso es {formatear(precioEquilibrio)}: por debajo de ahi la
                operacion da perdida.
              </p>
            )}
          </>
        )}
      </div>

      {/* La advertencia de unidad de venta. Va SIEMPRE, pegada al numero y
          dentro de la misma tarjeta: si vive tres bloques mas abajo, no la lee
          nadie y el numero queda dicho como si fuera infalible. */}
      <div
        className={`border-t px-4 py-3 sm:px-6 ${
          esPack ? "border-amber-200 bg-amber-50/70" : "border-gray-50 bg-gray-50/60"
        }`}
      >
        <p className={`text-xs leading-relaxed ${esPack ? "text-[#854D0E]" : "text-gray-500"}`}>
          {estadoUnidad === "sospecha" ? (
            <>
              <strong className="font-semibold">Revisa la unidad antes de usar este numero.</strong>{" "}
              Tu producto parece venderse por pack y la comparacion se hace contra
              las publicaciones tal como estan en Mercado Libre. Si el mercado
              lista la unidad suelta, estas comparando tu costo de varias unidades
              contra el precio de una, y el numero de arriba queda inflado.
            </>
          ) : estadoUnidad === "normalizado" ? (
            <>
              <strong className="font-semibold">Todo esta medido por unidad.</strong>{" "}
              {unidad!.multiplicador_consulta > 1 && (
                <>
                  Tu costo corresponde a un pack de {unidad!.multiplicador_consulta}, asi
                  que se dividio por {unidad!.multiplicador_consulta} antes de comparar.{" "}
                </>
              )}
              {unidad!.listings_ajustados > 0 && (
                <>
                  {unidad!.listings_ajustados} de {unidad!.listings_evaluados} publicaciones
                  se venden por pack y sus precios tambien se llevaron a precio por unidad.{" "}
                </>
              )}
              Solo se ajusta lo que el titulo declara: un pack que no se anuncia como
              tal sigue contando como una unidad.
            </>
          ) : estadoUnidad === "verificado" ? (
            <>
              Calculado por unidad. Ni tu producto ni las publicaciones del mercado
              declaran venderse por pack, asi que no hubo nada que ajustar. Si tu
              costo igual es por varias unidades, volve a cargarlo por unidad.
            </>
          ) : (
            <>
              Calculado sobre tu costo tal como lo ingresaste, contra los precios
              publicados en Mercado Libre. Si tu costo es por pack y el mercado
              vende la unidad suelta (o al reves), verifica que estes comparando
              la misma unidad.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
