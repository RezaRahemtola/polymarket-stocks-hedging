import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@polymarket/clob-client", "ethers", "axios"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ["@tanstack/react-query"],
  },
};

export default nextConfig;
