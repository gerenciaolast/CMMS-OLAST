import type { NextConfig } from 'next';

/** URL interna de la API (servidor a servidor). El navegador siempre llama a /api/v1 en el mismo dominio. */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // El lint corre aparte en CI (eslint.config.mjs del monorepo).
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
};

export default config;
