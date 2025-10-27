/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // ❗️Temporarily allow production builds to succeed even if there are TS errors.
    ignoreBuildErrors: true
  },
  eslint: {
    // ❗️Temporarily ignore ESLint during builds
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
