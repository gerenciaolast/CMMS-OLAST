import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // El lint corre aparte en CI (eslint.config.mjs del monorepo).
  eslint: { ignoreDuringBuilds: true },
};

export default config;
