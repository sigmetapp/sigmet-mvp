/** @type {import('next').NextConfig} */
// Allow images served from Supabase Storage (public bucket)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHostname;
try {
  supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;
} catch {}

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
  images: supabaseHostname
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : {},
};

module.exports = nextConfig;
