/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // TAB 5.2 (24/9) — /vigilancia se renombro a /seguimiento. Redirect
      // permanente: hay mails ya enviados (TAB 5.1, 23/9) que linkean a
      // /vigilancia y no se pueden romper.
      {
        source: "/vigilancia",
        destination: "/seguimiento",
        permanent: true,
      },
      // TAB 8 (11/10) — links de bio de TikTok. /tt/c1 estaba planeado desde
      // el 11/9 y nunca se desplego: daba 404 y en 30 dias le pegaron 6
      // visitantes. Temporal (307) a proposito: el destino puede cambiar y un
      // 308 queda cacheado en el navegador.
      {
        source: "/tt/:id",
        destination: "/?utm_source=tiktok&utm_medium=organico&utm_content=:id",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "http2.mlstatic.com",
      },
      {
        protocol: "https",
        hostname: "mlstatic.com",
      },
    ],
  },
};

export default nextConfig;
