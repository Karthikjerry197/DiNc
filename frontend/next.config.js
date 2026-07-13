/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Whitelist the origins allowed to request internal /_next/* dev assets.
  // Values are hostnames (no protocol/port), per the Next.js docs. Dev-only —
  // this option is ignored in production builds.
  // http://192.168.31.44:3000 -> '192.168.31.44'
  allowedDevOrigins: ['192.168.31.44', 'localhost', '127.0.0.1'],
};

module.exports = nextConfig;
