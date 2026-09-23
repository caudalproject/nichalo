/**
 * TAB 5 — el re-chequeo de un nicho vigilado.
 *
 * LA DECISION DE COSTO DE ESTE ARCHIVO: aca NO se llama a Gemini.
 *
 * El delta que le importa al vendedor — entraron 12 vendedores, el precio
 * mediano bajo 18%, aparecieron 3 publicaciones con envio gratis — sale entero
 * del scrape. Es un diff de `precioStats` y de la lista de vendedores. Meter al
 * modelo aca multiplicaria el costo por una frase que `armarTitular()` en
 * lib/delta.ts arma sola y gratis.
 *
 * Resultado: un re-chequeo de 30 publicaciones cuesta ~$119 ARS contra los ~$102
 * de un analisis completo... pero sin la parte cara. Y esquiva por construccion
 * el problema de determinismo: el delta se calcula sobre cantidades medidas.
 */

import { NonRetriableError } from "inngest";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "./inngest";
import { startApifyRun, checkApifyRun, getApifyResults } from "./apify";
import { calcularPrecioStats } from "./confianza";
import { calcularScore, calcularMetricas } from "./score";
import { normalizarUnidadDeVenta } from "./unidad";
import { filtrarRelevantes, aplicarPertenencia } from "./relevancia";
import { verificarPertenencia } from "./gemini";
import { PLAN_CONFIG } from "./plans";
import { notificarSiCorresponde } from "./notificar-seguimiento";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** El re-chequeo siempre scrapea la misma profundidad, sin importar el plan:
 *  una serie temporal medida con distinta n no es una serie temporal. */
const PROFUNDIDAD_RECHEQUEO = PLAN_CONFIG.free.maxItems;

const actualizarRun = async (run_id: string, fields: Record<string, unknown>) => {
  await supabase.from("watch_runs").update(fields).eq("id", run_id);
};

export const rechequearNicho = inngest.createFunction(
  {
    id: "rechequear-nicho",
    triggers: [{ event: "nichalo/seguimiento.rechequeo" }],
    retries: 20,
  },
  async ({ event, step }) => {
    const { run_id, watchlist_id, producto, pais, search_keyword, ficha_producto, perfil_vendedor, costo_estimado } =
      event.data as {
        run_id: string;
        watchlist_id: string;
        producto: string;
        pais: "AR" | "MX" | "CO";
        search_keyword?: string | null;
        ficha_producto?: string | null;
        perfil_vendedor: string;
        costo_estimado: number | null;
      };

    try {
      const runId = await step.run("start-apify", async () => {
        await actualizarRun(run_id, { status: "scraping" });
        // `search_keyword ?? producto`: la misma keyword que uso el analisis de
        // origen. Scrapear otra compararia dos mercados distintos y lo
        // reportaria como si el nicho hubiera cambiado.
        return await startApifyRun(search_keyword || producto, pais, "free");
      });

      const scrape = await step.run("wait-apify", async () => {
        const result = await checkApifyRun(runId);
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(result.status)) {
          throw new NonRetriableError(`Apify falló con status: ${result.status}`);
        }
        if (result.status !== "SUCCEEDED") {
          throw new Error(`Apify en progreso: ${result.status}`);
        }
        return await getApifyResults(runId, producto, pais, PROFUNDIDAD_RECHEQUEO);
      });

      await step.run("medir-y-guardar", async () => {
        if (scrape.totalListings === 0) {
          throw new NonRetriableError(
            "El scrape no devolvió publicaciones para este nicho."
          );
        }

        // Sin conversion de moneda: desde el 13/9 todo el pipeline vive en ARS
        // y getExchangeRate() es un no-op que devuelve 1 (ver lib/currency.ts).
        const costoIngresado = costo_estimado !== null ? costo_estimado : undefined;

        // TAB 3.2 (22/9) — la misma normalizacion de unidad que corre en el
        // analisis inicial. Tiene que estar en los dos lados o el delta del
        // TAB 5 compararia un score por unidad contra uno por pack y llamaria
        // "cambio del nicho" a un cambio de aritmetica nuestro.
        // El mismo filtro de relevancia que corre en el analisis inicial
        // (23/9). Tiene que estar en los dos lados por la misma razon que la
        // normalizacion de unidad: si el analisis midio 22 publicaciones del
        // producto y el re-chequeo mide 30 mezcladas con accesorios, el delta
        // reporta como "cambio del nicho" un cambio de criterio nuestro.
        const relevancia = filtrarRelevantes({
          producto,
          searchKeyword: search_keyword,
          listings: scrape.listings,
        });

        // La segunda pasada tambien corre aca. La nota de arriba dice que en
        // este archivo no se llama a Gemini, y sigue siendo cierta para lo que
        // importaba: el delta se calcula sobre cantidades medidas, sin prosa
        // del modelo. Esto es otra cosa — decidir que publicaciones entran a la
        // medicion — y tiene que usar el mismo criterio que el analisis de
        // origen o el delta compara dos mercados depurados distinto. Cuesta una
        // llamada de texto corto contra los ~$119 ARS del re-chequeo.
        const marcados = await verificarPertenencia({
          producto,
          ficha: ficha_producto,
          titulos: relevancia.listings.map((l) => l.title ?? ""),
        });
        const relevanciaFinal = aplicarPertenencia({
          listings: relevancia.listings,
          descartar: marcados,
          nOriginal: scrape.listings.length,
          descartadosPrevios: relevancia.n_descartados,
          descartablesPrevios: relevancia.n_descartables,
          muestraPrevia: relevancia.muestra_descartada,
        });

        const normalizado = normalizarUnidadDeVenta({
          producto,
          costoLocal: costoIngresado,
          listings: relevanciaFinal.listings,
        });
        const listingsNormalizados = normalizado.listings;
        const costoLocal = normalizado.costoUnitario;

        const precios = listingsNormalizados
          .map((l) => l.price)
          .filter((p): p is number => p !== null && p > 0);
        const totalConVentas = listingsNormalizados.filter(
          (l) => (l.soldQuantity ?? 0) > 0
        ).length;

        const calculado = calcularPrecioStats(precios, totalConVentas, costoLocal, {
          n_descartados: relevanciaFinal.n_descartados,
          n_descartables: relevanciaFinal.n_descartables,
          aplicado: relevanciaFinal.aplicado,
          muestra_descartada: relevanciaFinal.muestra_descartada,
          n_evaluados: scrape.listings.length,
        });
        if (!calculado) {
          throw new NonRetriableError(
            "No se encontraron precios válidos en el re-chequeo."
          );
        }

        // El score se recalcula solo si hay costo: sin costo no hay margen, y el
        // margen pesa 40 de los puntos. Un score sin el se veria como una caida
        // del nicho cuando lo unico que falta es un input del usuario.
        const scoreCalculado =
          costoLocal !== undefined
            ? calcularScore({
                producto,
                pais,
                perfil: perfil_vendedor,
                costoLocal,
                listings: listingsNormalizados,
                stats: calculado.stats,
                confianza: calculado.confianza,
                unidad: normalizado.unidad,
              })
            : null;

        const metricas =
          // Listings normalizados, no crudos: las `stats` que van al lado ya
          // estan por unidad y mezclarlos daria metricas de dos escalas.
          scoreCalculado?.metricas ?? calcularMetricas(listingsNormalizados, calculado.stats);

        const vendedores = Array.from(
          new Set(
            scrape.listings
              .map((l) => (l.seller ?? "").trim())
              .filter((v) => v.length > 0)
          )
        );

        // Snapshot acotado: las 10 mas baratas. Alcanza para mostrar QUE
        // publicacion aparecio sin guardar 30 filas de jsonb cada semana.
        //
        // OJO: va sobre `scrape.listings` CRUDO, no sobre los normalizados del
        // TAB 3.2, y es a proposito. Cada fila lleva `url` a la publicacion
        // real: mostrar ahi un precio por unidad que no coincide con la pagina
        // de Mercado Libre rompe la confianza mas de lo que el bug arreglaba.
        // Los percentiles y el score van por unidad; lo que se muestra con link
        // al lado, no.
        const topListings = [...scrape.listings]
          .filter((l) => typeof l.price === "number" && (l.price ?? 0) > 0)
          .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
          .slice(0, 10)
          .map((l) => ({
            title: l.title,
            price: l.price,
            seller: l.seller,
            url: l.url,
            isFreeShipping: l.isFreeShipping,
          }));

        await actualizarRun(run_id, {
          status: "done",
          fetched_at: new Date().toISOString(),
          n_listings: scrape.totalListings,
          precio_stats: calculado.stats,
          metricas,
          vendedores,
          top_listings: topListings,
          score: scoreCalculado?.score ?? null,
          score_detalle: scoreCalculado
            ? {
                formula: scoreCalculado.formula,
                score_bruto: scoreCalculado.score_bruto,
                puntos_obtenidos: scoreCalculado.puntos_obtenidos,
                puntos_posibles: scoreCalculado.puntos_posibles,
                componentes: scoreCalculado.componentes,
                omitidos: scoreCalculado.omitidos,
                techo_aplicado: scoreCalculado.techo_aplicado,
                motivo_techo: scoreCalculado.motivo_techo,
                precio_equilibrio: scoreCalculado.precio_equilibrio,
                margen_mediana_pct: scoreCalculado.margen_mediana_pct,
                unidad: scoreCalculado.unidad,
              }
            : null,
          formula: scoreCalculado?.formula ?? null,
          apify_run_id: runId,
        });

        await supabase
          .from("watchlist")
          .update({ last_check_at: new Date().toISOString() })
          .eq("id", watchlist_id);
      });

      // TAB 5.1 (23/9) — el aviso. Va en su propio paso y NO puede lanzar:
      // la medicion ya esta guardada y el primer paso de esta funcion es un
      // scrape pago. Un mail caido no puede ensuciar el estado de una funcion
      // que cuesta $119 ARS arrancar. `notificarSiCorresponde` decide sola si
      // corresponde mandarlo (solo corridas del cron, solo con cambios
      // materiales o resumen mensual) y atrapa sus propios errores.
      const aviso = await step.run("notificar", async () => {
        return await notificarSiCorresponde(run_id);
      });

      return { ok: true, aviso };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      await actualizarRun(run_id, { status: "error", error_message: mensaje });
      throw err;
    }
  }
);
