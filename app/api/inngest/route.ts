import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { analizarProducto } from "@/lib/inngest-functions";

const handler = serve({
  client: inngest,
  functions: [analizarProducto],
});

export const GET = async (req: Request) => {
  const res = await handler.GET(req);
  if (!res.ok) {
    const body = await res.clone().text();
    console.error("[inngest] GET error", res.status, body);
  }
  return res;
};

export const POST = async (req: Request) => {
  const res = await handler.POST(req);
  if (!res.ok) {
    const body = await res.clone().text();
    console.error("[inngest] POST error", res.status, body);
  }
  return res;
};

export const PUT = async (req: Request) => {
  const res = await handler.PUT(req);
  if (!res.ok) {
    const body = await res.clone().text();
    console.error("[inngest] PUT error", res.status, body);
  }
  return res;
};
