import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { analizarProducto } from "@/lib/inngest-functions";
import { rechequearNicho } from "@/lib/seguimiento";
import { cronSeguimientoSemanal } from "@/lib/cron-seguimiento";
import { cronPagosHuerfanos } from "@/lib/cron-pagos-huerfanos";
import { cronMailSeguimiento, backfillMailSeguimiento } from "@/lib/mail-seguimiento";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    analizarProducto,
    rechequearNicho,
    cronSeguimientoSemanal,
    cronPagosHuerfanos,
    cronMailSeguimiento,
    backfillMailSeguimiento,
  ],
});
