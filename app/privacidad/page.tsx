import { Navbar } from "@/components/Navbar";

export default function PrivacidadPage() {
  return (
    <>
      <Navbar />
      <main className="container py-16 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Política de Privacidad</h1>
        <div className="prose prose-gray max-w-none space-y-6 text-sm text-gray-700 leading-relaxed">
          <p><strong>Última actualización:</strong> Junio 2026</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">1. Información que recopilamos</h2>
          <p>Recopilamos: email y nombre (a través de Google OAuth), productos analizados e historial de análisis, plan de suscripción y datos de pago (procesados por Mercado Pago, no almacenamos datos de tarjeta).</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">2. Uso de la información</h2>
          <p>Usamos tu información para: proveer el servicio de análisis, enviarte emails transaccionales (resultado de análisis, bienvenida), procesar pagos y gestionar tu suscripción.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">3. Almacenamiento</h2>
          <p>Los datos se almacenan en Supabase (infraestructura en la nube con servidores en Estados Unidos). Los análisis se conservan mientras tengas una cuenta activa.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">4. Compartir datos</h2>
          <p>No vendemos ni compartimos tus datos con terceros, excepto los proveedores necesarios para operar el servicio: Supabase (base de datos), Mercado Pago (pagos), Resend (emails), Apify (scraping de datos públicos), Google Gemini (análisis con IA).</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">5. Cookies</h2>
          <p>Nichalo usa cookies de sesión para mantenerte autenticado. No usamos cookies de seguimiento ni publicidad.</p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">6. Tus derechos</h2>
          <p>Podés solicitar la eliminación de tu cuenta y datos en cualquier momento escribiendo a <a href="mailto:hola@nichalo.com" className="text-green-600 hover:underline">hola@nichalo.com</a></p>

          <h2 className="text-lg font-semibold text-gray-900 mt-8">7. Contacto</h2>
          <p>Para consultas sobre privacidad: <a href="mailto:hola@nichalo.com" className="text-green-600 hover:underline">hola@nichalo.com</a></p>
        </div>
      </main>
    </>
  );
}
