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
