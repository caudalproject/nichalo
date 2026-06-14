import { Navbar } from "@/components/Navbar";

export default function TerminosPage() {
  return (
    <>
      <Navbar />
      <main className="container py-16 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Términos y Condiciones</h1>
        <div className="prose prose-gray max-w-none space-y-6 text-sm text-gray-700 leading-relaxed">
          <p><strong>Última actualización:</strong> Junio 2026</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">1. Descripción del servicio</h2>
          <p>Nichalo es una plataforma de análisis de productos para vendedores de Mercado Libre. El servicio permite analizar la viabilidad de productos antes de invertir en stock, utilizando datos reales de publicaciones en Mercado Libre.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">2. Uso del servicio</h2>
          <p>Al usar Nichalo, aceptás utilizar el servicio únicamente para fines lícitos y de acuerdo con estos términos. No podés usar el servicio para actividades ilegales, fraudulentas o que perjudiquen a terceros.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">3. Planes y pagos</h2>
          <p>Nichalo ofrece planes de suscripción mensual. Los pagos se procesan a través de Mercado Pago. Podés cancelar tu suscripción en cualquier momento desde tu perfil. No se realizan reembolsos por períodos parciales.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">4. Análisis y datos</h2>
          <p>Los análisis generados por Nichalo son estimaciones basadas en datos públicos de Mercado Libre y no constituyen asesoramiento financiero o comercial. Nichalo no garantiza resultados de ventas ni rentabilidad.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">5. Limitación de responsabilidad</h2>
          <p>Nichalo no se responsabiliza por decisiones comerciales tomadas en base a los análisis generados. El usuario es responsable de validar la información antes de invertir.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">6. Modificaciones</h2>
          <p>Nichalo puede modificar estos términos en cualquier momento. Los cambios serán notificados por email. El uso continuado del servicio implica aceptación de los nuevos términos.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">7. Contacto</h2>
          <p>Para consultas sobre estos términos, contactanos en <a href="mailto:hola@nichalo.com" className="text-green-600 hover:underline">hola@nichalo.com</a></p>
        </div>
      </main>
    </>
  );
}
