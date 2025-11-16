/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // ❗️Temporarily allow production builds to succeed even if there are TS errors.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ❗️Temporarily ignore ESLint during builds
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["posthog-node"],
  },
  // Кеширование статических ресурсов для ускорения повторных загрузок
  async headers() {
    return [
      {
        // Кеширование статических файлов Next.js (JS, CSS)
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Кеширование изображений
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        // Кеширование API favicon
        source: '/api/favicon:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
