import path from "node:path";
import type { NextConfig } from "next";
import { resolveNextBuildCpuCap } from "@celebix/platform-config";

const buildCpuCap = resolveNextBuildCpuCap(2, ["CELEBIX_OWNER_BUILD_CPUS"]);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@celebix/platform-config"],
  turbopack: {
    root: path.join(__dirname, "../..")
  },
  experimental: {
    cpus: buildCpuCap,
  },
  poweredByHeader: false
};

export default nextConfig;
