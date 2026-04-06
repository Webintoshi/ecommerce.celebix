import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

interface StoreRegistryEntry {
  slug: string;
}

interface StoreManifest {
  name?: string;
  slug?: string;
  branding?: {
    tagline?: string;
    supportEmail?: string;
    supportPhone?: string;
  };
  domains?: {
    storefront?: string;
    admin?: string;
  };
  supabase?: {
    url?: string;
  };
  r2?: {
    publicUrl?: string;
  };
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function resolveActiveStore() {
  const repoRoot = path.join(__dirname, "../..");
  const configuredSlug = process.env.STORE_SLUG ?? process.env.NEXT_PUBLIC_STORE_SLUG;
  const registry =
    readJsonFile<StoreRegistryEntry[]>(path.join(repoRoot, "stores", "registry.json")) ?? [];
  const slug = configuredSlug ?? registry[0]?.slug ?? "default-store";
  const manifest = readJsonFile<StoreManifest>(
    path.join(repoRoot, "stores", slug, "store.config.json"),
  );

  return {
    slug,
    name: manifest?.name ?? "Celebix E-ticaret",
    tagline: manifest?.branding?.tagline ?? "Celebix Storefront Base",
    supportEmail: manifest?.branding?.supportEmail ?? `destek@${slug}.local`,
    supportPhone: manifest?.branding?.supportPhone ?? "+90 532 000 00 00",
    storefrontDomain: manifest?.domains?.storefront ?? `${slug}.celebix.co`,
    adminDomain: manifest?.domains?.admin ?? "panel.celebix.co",
    supabaseUrl: manifest?.supabase?.url ?? "",
    r2PublicUrl: manifest?.r2?.publicUrl ?? "",
  };
}

function buildRemotePatterns(assetUrl?: string): NonNullable<NextConfig["images"]>["remotePatterns"] {
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
    {
      protocol: "https",
      hostname: "images.unsplash.com",
      pathname: "/**",
    },
    {
      protocol: "https",
      hostname: "**.supabase.co",
      pathname: "/**",
    },
  ];

  const publicUrl = assetUrl || process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

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

const activeStore = resolveActiveStore();
const inferredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? `https://${activeStore.storefrontDomain}`;
const inferredAdminUrl =
  process.env.NEXT_PUBLIC_ADMIN_URL ?? `https://${activeStore.adminDomain}`;
const inferredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? activeStore.supabaseUrl;
const inferredR2PublicUrl = process.env.R2_PUBLIC_URL ?? activeStore.r2PublicUrl;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  env: {
    NEXT_PUBLIC_STORE_SLUG: activeStore.slug,
    NEXT_PUBLIC_STORE_NAME: process.env.NEXT_PUBLIC_STORE_NAME ?? activeStore.name,
    NEXT_PUBLIC_STORE_TAGLINE: process.env.NEXT_PUBLIC_STORE_TAGLINE ?? activeStore.tagline,
    NEXT_PUBLIC_STORE_DESCRIPTION:
      process.env.NEXT_PUBLIC_STORE_DESCRIPTION ??
      `${activeStore.name} icin ortak Celebix storefront temasi.`,
    NEXT_PUBLIC_STORE_SUPPORT_EMAIL:
      process.env.NEXT_PUBLIC_STORE_SUPPORT_EMAIL ?? activeStore.supportEmail,
    NEXT_PUBLIC_STORE_SUPPORT_PHONE:
      process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE ?? activeStore.supportPhone,
    NEXT_PUBLIC_SITE_URL: inferredSiteUrl,
    NEXT_PUBLIC_ADMIN_URL: inferredAdminUrl,
    NEXT_PUBLIC_SUPABASE_URL: inferredSupabaseUrl,
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? inferredR2PublicUrl,
  },
  serverExternalPackages: ["iyzipay"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
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
    remotePatterns: buildRemotePatterns(inferredR2PublicUrl),
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
