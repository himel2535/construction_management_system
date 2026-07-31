import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    return [
      {
        source: "/clients",
        destination: "/customers",
      },
      {
        source: "/clients/:path*",
        destination: "/customers",
      },
      {
        source: "/customers/:path*",
        destination: "/customers",
      },
      {
        source: "/projects/:path*",
        destination: "/projects",
      },
      {
        source: "/reports/:path*",
        destination: "/reports",
      },
    ];
  },
};

export default nextConfig;
