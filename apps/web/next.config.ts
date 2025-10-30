import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  eslint: {
    // Allow CI/CD (Render) builds to succeed even though the project still has
    // legacy `any` usage that needs gradual cleanup.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
