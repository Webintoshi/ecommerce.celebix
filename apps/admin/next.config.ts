import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

interface StoreRegistryEntry {
  slug: string;
}

interface StoreManifest {
  name: string;
  slug: string;
  branding?: {
    tagline?: string;
    supportEmail?: string;
    supportPhone?: string;
    senderEmail?: string;
    smsSenderTitle?: string;
    defaultProductBrand?: string;
  };
  domains?: {
    storefront?: string;
    admin?: string;
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
    tagline: manifest?.branding?.tagline ?? "Celebix Panel ortak e-ticaret altyapisi",
    supportEmail: manifest?.branding?.supportEmail ?? `destek@${slug}.local`,
    supportPhone: manifest?.branding?.supportPhone ?? "",
    senderEmail: manifest?.branding?.senderEmail ?? `noreply@${slug}.local`,
    smsSenderTitle: manifest?.branding?.smsSenderTitle ?? slug.replace(/-/g, "").toUpperCase(),
    defaultProductBrand:
      manifest?.branding?.defaultProductBrand ?? manifest?.name ?? "Celebix E-ticaret",
    storefrontDomain: manifest?.domains?.storefront ?? "localhost:3300",
    adminDomain: manifest?.domains?.admin ?? "localhost:3200",
  };
}

const activeStore = resolveActiveStore();
const configuredAssetUrl = process.env.R2_PUBLIC_URL;
const configuredAssetHostname = configuredAssetUrl
  ? new URL(
      configuredAssetUrl.startsWith("http://") || configuredAssetUrl.startsWith("https://")
        ? configuredAssetUrl
        : `https://${configuredAssetUrl}`,
    ).hostname
  : null;

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "**.r2.cloudflarestorage.com",
    pathname: "/**"
  },
  {
    protocol: "https",
    hostname: "**.r2.dev",
    pathname: "/**"
  },
  {
    protocol: "https",
    hostname: "pub-245578082b99402d9e1093b849089bb2.r2.dev",
    pathname: "/**"
  }
];

if (configuredAssetHostname) {
  remotePatterns.push({
    protocol: "https",
    hostname: configuredAssetHostname,
    pathname: "/**"
  });
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@celebix/platform-config"],
  serverExternalPackages: ["iyzipay"],
  env: {
    NEXT_PUBLIC_STORE_SLUG: activeStore.slug,
    NEXT_PUBLIC_STORE_NAME: activeStore.name,
    NEXT_PUBLIC_STORE_TAGLINE: activeStore.tagline,
    NEXT_PUBLIC_STORE_DOMAIN: activeStore.storefrontDomain,
    NEXT_PUBLIC_ADMIN_DOMAIN: activeStore.adminDomain,
    NEXT_PUBLIC_STORE_SUPPORT_EMAIL: activeStore.supportEmail,
    NEXT_PUBLIC_STORE_SUPPORT_PHONE: activeStore.supportPhone,
    NEXT_PUBLIC_STORE_SENDER_EMAIL: activeStore.senderEmail,
    NEXT_PUBLIC_STORE_SMS_SENDER: activeStore.smsSenderTitle,
    NEXT_PUBLIC_DEFAULT_PRODUCT_BRAND: activeStore.defaultProductBrand,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL ?? `https://${activeStore.storefrontDomain}`,
    NEXT_PUBLIC_ADMIN_URL:
      process.env.NEXT_PUBLIC_ADMIN_URL ?? `https://${activeStore.adminDomain}`,
    NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL:
      process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL ?? `admin@${activeStore.slug}.local`
  },
  turbopack: {
    root: path.join(__dirname, "../..")
  },
  typescript: {
    ignoreBuildErrors: true
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
  },
  sassOptions: {
    includePaths: ["./app/styles"],
    quietDeps: true
  },
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 0,
    remotePatterns
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    },
    optimizeCss: true
  },
  poweredByHeader: false
};

export default nextConfig;
