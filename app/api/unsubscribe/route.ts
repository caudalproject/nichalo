import { NextResponse } from "next/server";
import { buscarPorToken, darDeBaja } from "@/lib/baja-mails";

export const dynamic = "force-dynamic";

/**
 * Baja en un clic (RFC 8058, TAB 3.8). Gmail/Yahoo hacen POST aca cuando el
 * usuario toca "Cancelar suscripcion" en su cliente de correo — es el destino
 * del header `List-Unsubscribe`. Solo POST: un GET de un escaner de links no
 * debe dar de baja a nadie (para humanos esta la pagina /unsubscribe).
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const estado = await buscarPorToken(token);
  if (estado && !estado.yaDadoDeBaja) await darDeBaja(estado.userId);
  return new NextResponse(null, { status: 200 });
}
