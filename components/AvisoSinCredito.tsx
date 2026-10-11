import { Info } from "lucide-react";

/**
 * Aviso para quien se registro pero no recibio el analisis gratis porque el
 * anti-multicuentas detecto que esa casilla de mail (o ese dispositivo/red)
 * ya lo habia reclamado en los ultimos 30 dias.
 *
 * Tono: sin acusar. Puede ser alguien que comparte wifi o un alias de Gmail
 * sin mala intencion, asi que explica el motivo, ofrece una salida (escribir)
 * y deja el camino de pago al banner de planes que va justo debajo.
 */
export function AvisoSinCredito() {
  return (
    <div
      role="status"
      className="mt-6 flex gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 sm:p-5"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6]">
        <Info className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#0A0A0A]">
          Tu análisis gratis ya fue usado desde esta casilla o dispositivo
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">
          Entregamos un análisis gratis por persona. Detectamos que este mail o
          esta conexión ya lo reclamó en los últimos 30 días, así que tu cuenta
          arrancó sin crédito. Si creés que es un error,{" "}
          <a
            href="mailto:hola@nichalo.com?subject=No%20recib%C3%AD%20mi%20an%C3%A1lisis%20gratis"
            className="font-medium text-[#16A34A] hover:underline"
          >
            escribinos a hola@nichalo.com
          </a>{" "}
          y lo revisamos. Si no, podés seguir con un pack.
        </p>
      </div>
    </div>
  );
}
