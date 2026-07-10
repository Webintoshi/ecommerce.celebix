import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@celebix/saas-contracts"],
  turbopack: {
    root: path.join(import.meta.dirname, "../.."),
  },
  poweredByHeader: false,
};

export default nextConfig;
