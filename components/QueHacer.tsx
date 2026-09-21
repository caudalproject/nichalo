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
 * El calculo NO distingue unidad de venta: un pack x3 se compara contra el
 * scrape de unidades sueltas. Es el TAB 3.2, pendiente al escribir esto. El
 * caso vivo es el analisis del 21/9 — costo de un pack de 3 rollos ($150.000)
 * contra una mediana de rollos sueltos ($62.980), margen −1375%.
 *
 * Por eso el precio de equilibrio NUNCA se muestra pelado. Siempre lleva la
 * linea de "sobre que unidad esta calculado", y si el titulo del producto
 * huele a pack la advertencia sube de tono. Un numero equivocado dicho con
 * seguridad es peor que no dar numero: es exactamente la clase de dato
 * inventado que el bloque del desglose existe para desmentir.
 */

/**
 * Heuristica, no deteccion. Busca "pack", "x3", "combo", "set de", "docena",
 * "kit" en el texto que tipeo el usuario. Falsos negativos de sobra (un pack
 * puede no decirlo) y algun falso positivo ("kit de limpieza" que se vende
 * como kit en los dos lados, donde la comparacion esta bien). Solo decide el
 * TONO de una advertencia que se muestra igual en los dos casos, asi que
 * equivocarse no rompe nada.
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
}) {
  const enPerdida = margenBruto < 0;
  const esPack = pareceUnPack(producto);

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
          {esPack ? (
            <>
              <strong className="font-semibold">Revisa la unidad antes de usar este numero.</strong>{" "}
              Tu producto parece venderse por pack y la comparacion se hace contra
              las publicaciones tal como estan en Mercado Libre. Si el mercado
              lista la unidad suelta, estas comparando tu costo de varias unidades
              contra el precio de una, y el numero de arriba queda inflado.
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
