import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@celebix/platform-config"],
  turbopack: {
    root: path.join(__dirname, "../..")
  },
  poweredByHeader: false
};

export default nextConfig;
