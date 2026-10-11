import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buscarPorId, buscarPorToken, darDeBaja, enmascarar } from "@/lib/baja-mails";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Darme de baja · Nichalo",
  robots: { index: false, follow: false },
};

/**
 * /unsubscribe (TAB 3.8, 11/10/2026). Daba 404 desde junio: el upsell lo
 * prometia en cada envio.
 *
 * - Con `?t=<baja_token>` (mails nuevos): baja sin iniciar sesion.
 * - Sin token (mails viejos, que linkean a /unsubscribe pelado): si hay
 *   sesion, se da de baja esa cuenta; si no, pide iniciar sesion.
 *
 * Siempre pide CONFIRMAR con un boton: abrir el link no da de baja, porque
 * los escaneres de links de los proveedores de correo abren todo lo que llega.
 * La baja en un clic sin pagina es el POST de /api/unsubscribe.
 */
async function confirmarBaja(formData: FormData) {
  "use server";
  const t = String(formData.get("t") ?? "");
  let userId: string | null = null;

  if (t) {
    userId = (await buscarPorToken(t))?.userId ?? null;
  } else {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (userId) await darDeBaja(userId);
  redirect(`/unsubscribe?${t ? `t=${encodeURIComponent(t)}&` : ""}ok=1`);
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; ok?: string };
}) {
  const token = typeof searchParams.t === "string" ? searchParams.t : "";

  let estado = null;
  if (token) {
    estado = await buscarPorToken(token);
  } else {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) estado = await buscarPorId(user.id);
  }

  const listo = searchParams.ok === "1" || estado?.yaDadoDeBaja;

  return (
    <>
      <Navbar />
      <main className="container py-16 max-w-md mx-auto">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
          {listo ? (
            <>
              <h1 className="text-xl font-bold text-[#0A0A0A]">Listo, te diste de baja</h1>
              <p className="text-sm text-[#374151] leading-relaxed">
                No te vamos a mandar más mails de ofertas ni de seguimiento de tu análisis
                {estado ? <> a <strong>{enmascarar(estado.email)}</strong></> : null}.
              </p>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Vas a seguir recibiendo el aviso de &quot;tu análisis está listo&quot; cuando analices un producto,
                y los mails de los productos que seguís (esos se cortan dejando de seguir el producto en{" "}
                <Link href="/seguimiento" className="text-[#16A34A] hover:underline">tu lista de seguimiento</Link>).
              </p>
            </>
          ) : estado ? (
            <>
              <h1 className="text-xl font-bold text-[#0A0A0A]">¿Darte de baja?</h1>
              <p className="text-sm text-[#374151] leading-relaxed">
                Dejás de recibir mails de ofertas y de seguimiento de tu análisis en{" "}
                <strong>{enmascarar(estado.email)}</strong>.
              </p>
              <form action={confirmarBaja}>
                {token && <input type="hidden" name="t" value={token} />}
                <Button type="submit" className="w-full rounded-md">
                  Confirmar baja
                </Button>
              </form>
              <p className="text-xs text-[#6B7280]">
                El aviso de &quot;tu análisis está listo&quot; sigue llegando: es la respuesta a algo que pediste.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#0A0A0A]">Darme de baja</h1>
              <p className="text-sm text-[#374151] leading-relaxed">
                {token
                  ? "Este link de baja no es válido o ya venció. "
                  : null}
                Iniciá sesión con la cuenta que recibe los mails y te damos de baja desde acá.
              </p>
              <Link href="/login?redirect=/unsubscribe">
                <Button className="w-full rounded-md">Iniciar sesión</Button>
              </Link>
              <p className="text-xs text-[#6B7280]">
                ¿No podés entrar? Escribinos a{" "}
                <a href="mailto:hola@nichalo.com" className="text-[#16A34A] hover:underline">hola@nichalo.com</a>{" "}
                y te damos de baja a mano.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
