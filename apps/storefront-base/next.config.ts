import type { NextConfig } from "next";

function buildRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
    {
      protocol: "https",
      hostname: "**.r2.cloudflarestorage.com",
      pathname: "/**",
    },
    {
      protocol: "https",
      hostname: "**.r2.dev",
      pathname: "/**",
    },
  ];

  const publicUrl = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  if (publicUrl) {
    try {
      const normalized = publicUrl.startsWith("http://") || publicUrl.startsWith("https://")
        ? publicUrl
        : `https://${publicUrl}`;
      const parsed = new URL(normalized);

      patterns.push({
        protocol: parsed.protocol.replace(":", "") as "http" | "https",
        hostname: parsed.hostname,
        pathname: "/**",
      });
    } catch {
      // Ignore malformed URLs in the base theme.
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["iyzipay"],
  typescript: {
    ignoreBuildErrors: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  sassOptions: {
    includePaths: ["./app/styles"],
    quietDeps: true,
  },
  images: {
    loader: "custom",
    loaderFile: "./image-loader.js",
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 0,
    remotePatterns: buildRemotePatterns(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizeCss: true,
  },
  compress: true,
  poweredByHeader: false,
  modularizeImports: {
    "@heroicons/react/24/outline": {
      transform: "{{name}}",
    },
    lucideReact: {
      transform: "lucide-react/{{name}}",
    },
  },
};

export default nextConfig;
