import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  requireStoreConfig,
  type StoreConfig,
  updateStoreStorefrontConfig,
} from "@celebix/platform-config";

interface StorefrontScaffoldResult {
  appDirectory: string;
  relativeAppDirectory: string;
}

const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
]);

function toPackageName(slug: string): string {
  return `@celebix/storefront-${slug}`;
}

function normalizeUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function serializeEnv(entries: Record<string, string>): string {
  return `${Object.entries(entries)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

function parseEnvFile(contents: string): Record<string, string> {
  const envMap: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (key) {
      envMap[key] = value;
    }
  }

  return envMap;
}

function buildPackageJson(slug: string): string {
  return `${JSON.stringify(
    {
      name: toPackageName(slug),
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next dev --port 3400",
        build: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next build",
        start: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next start --port 3400",
        typecheck: "tsc -p tsconfig.json --noEmit",
      },
      dependencies: {
        "@aws-sdk/client-s3": "^3.985.0",
        "@craftgate/craftgate": "^1.0.65",
        "@dnd-kit/core": "^6.1.0",
        "@dnd-kit/sortable": "^8.0.0",
        "@dnd-kit/utilities": "^3.2.2",
        "@google-analytics/data": "^5.2.1",
        "@headlessui/react": "^2.2.9",
        "@hookform/resolvers": "^3.9.0",
        "@radix-ui/react-accordion": "^1.2.0",
        "@radix-ui/react-alert-dialog": "^1.1.0",
        "@radix-ui/react-checkbox": "^1.1.0",
        "@radix-ui/react-dialog": "^1.1.0",
        "@radix-ui/react-dropdown-menu": "^2.1.0",
        "@radix-ui/react-label": "^2.1.0",
        "@radix-ui/react-radio-group": "^1.2.0",
        "@radix-ui/react-scroll-area": "^1.1.0",
        "@radix-ui/react-select": "^2.1.0",
        "@radix-ui/react-separator": "^1.1.0",
        "@radix-ui/react-switch": "^1.1.0",
        "@radix-ui/react-tabs": "^1.1.0",
        "@supabase/ssr": "^0.8.0",
        "@supabase/supabase-js": "^2.95.3",
        "@types/mdx": "^2.0.13",
        "class-variance-authority": "^0.7.0",
        clsx: "^2.1.1",
        critters: "^0.0.23",
        "cross-env": "^10.1.0",
        "date-fns": "^4.1.0",
        "framer-motion": "^12.29.0",
        "gray-matter": "^4.0.3",
        iyzipay: "^2.0.65",
        "lucide-react": "^0.563.0",
        next: "16.2.1",
        "next-mdx-remote": "^6.0.0",
        react: "19.2.3",
        "react-dom": "19.2.3",
        "react-hook-form": "^7.53.0",
        redis: "^5.11.0",
        "reading-time": "^1.5.0",
        recharts: "^3.7.0",
        "rehype-raw": "^7.0.0",
        "rehype-stringify": "^10.0.1",
        "remark-gfm": "^4.0.1",
        sass: "^1.97.3",
        "server-only": "^0.0.1",
        sharp: "^0.34.5",
        sonner: "^2.0.7",
        stripe: "^20.4.1",
        "tailwind-merge": "^3.4.0",
        zod: "^3.23.8",
      },
      devDependencies: {
        "@tailwindcss/postcss": "^4",
        "@types/node": "^24.6.0",
        "@types/react": "^19.2.2",
        "@types/react-dom": "^19.2.2",
        eslint: "^9.38.0",
        "eslint-config-next": "16.2.1",
        tailwindcss: "^4.1.14",
        typescript: "^5.9.3",
      },
    },
    null,
    2,
  )}\n`;
}

function buildTsConfig(): string {
  return `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`;
}

function buildStorefrontPublicEnv(store: StoreConfig): Record<string, string> {
  const socialHandle = store.slug.replace(/-/g, "");

  return {
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SITE_URL: normalizeUrl(store.domains.storefront),
    NEXT_PUBLIC_ADMIN_URL: normalizeUrl(store.domains.admin),
    NEXT_PUBLIC_STORE_NAME: store.name,
    NEXT_PUBLIC_STORE_TAGLINE:
      store.branding?.tagline || `${store.name} icin Celebix storefront referansi`,
    NEXT_PUBLIC_STORE_DESCRIPTION: `${store.name} icin ortak Celebix storefront temasi.`,
    NEXT_PUBLIC_STORE_SUPPORT_EMAIL:
      store.branding?.supportEmail || `destek@${store.domains.storefront}`,
    NEXT_PUBLIC_STORE_SUPPORT_PHONE: store.branding?.supportPhone || "+90 532 000 00 00",
    NEXT_PUBLIC_STORE_LOGO: "/placeholder-storefront-logo.svg",
    NEXT_PUBLIC_STORE_INSTAGRAM: `https://instagram.com/${socialHandle}`,
    NEXT_PUBLIC_STORE_FACEBOOK: `https://facebook.com/${socialHandle}`,
    NEXT_PUBLIC_STORE_TWITTER: `https://x.com/${socialHandle}`,
    NEXT_PUBLIC_FREE_SHIPPING_TEXT: "500 TL uzeri siparislerde ucretsiz kargo",
  };
}

function buildStorefrontExampleEnv(store: StoreConfig): Record<string, string> {
  return {
    ...buildStorefrontPublicEnv(store),
    NEXT_PUBLIC_SUPABASE_URL:
      store.supabase.url !== "configure-in-env"
        ? store.supabase.url
        : "https://your-project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "configure-per-store",
    SUPABASE_SERVICE_ROLE_KEY: "configure-per-store-service-role",
    REDIS_URL: "redis://your-coolify-redis:6379",
    REDIS_PREFIX: "celebix",
    CLOUDFLARE_ACCOUNT_ID: "your-r2-account-id",
    R2_ACCESS_KEY_ID: "your-r2-access-key",
    R2_SECRET_ACCESS_KEY: "your-r2-secret",
    R2_BUCKET_NAME: store.r2?.bucketName || `${store.slug}-assets`,
    R2_PUBLIC_URL:
      store.r2?.publicUrl || `https://cdn.${store.domains.storefront}`,
  };
}

function getBaseStorefrontDirectory(repoRoot: string): string {
  return path.join(repoRoot, "apps", "storefront-base");
}

function getAdminEnvLocalPath(repoRoot: string, store: StoreConfig): string {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  return path.join(repoRoot, relativePath);
}

function readExistingAdminEnvEntries(repoRoot: string, store: StoreConfig): Record<string, string> {
  const envLocalPath = getAdminEnvLocalPath(repoRoot, store);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
}

function isTextFile(filePath: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath));
}

function getAllFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function replaceStorefrontPlaceholders(appDirectory: string, store: StoreConfig): void {
  const supportEmail = store.branding?.supportEmail || `destek@${store.domains.storefront}`;
  const senderEmail = store.branding?.senderEmail || `noreply@${store.domains.storefront}`;
  const supportPhone = store.branding?.supportPhone || "+90 532 000 00 00";
  const uppercaseStoreName = store.name.toLocaleUpperCase("tr");
  const plainHandle = store.slug.replace(/-/g, "");
  const replacements: Array<[string, string]> = [
    ["hello@ornek-magaza.celebix.co", supportEmail],
    ["destek@ornek-magaza.celebix.co", supportEmail],
    ["noreply@ornek-magaza.celebix.co", senderEmail],
    ["admin@ornek-magaza.celebix.co", supportEmail],
    ["https://ornek-magaza.celebix.co", normalizeUrl(store.domains.storefront)],
    ["ornek-magaza.celebix.co", store.domains.storefront],
    ["+90 555 000 00 00", supportPhone],
    ["ORNEK MAGAZA", uppercaseStoreName],
    ["Ornek Magaza", store.name],
    ["ornekmagaza", plainHandle],
  ];

  for (const filePath of getAllFiles(appDirectory)) {
    if (!isTextFile(filePath)) {
      continue;
    }

    let contents = fs.readFileSync(filePath, "utf8");
    let nextContents = contents;

    for (const [searchValue, replacementValue] of replacements) {
      nextContents = nextContents.split(searchValue).join(replacementValue);
    }

    if (nextContents !== contents) {
      fs.writeFileSync(filePath, nextContents, "utf8");
    }
  }
}

export function scaffoldStorefrontApp(slug: string): StorefrontScaffoldResult {
  const store = requireStoreConfig(slug);
  const repoRoot = getRepoRoot();
  const baseDirectory = getBaseStorefrontDirectory(repoRoot);
  const relativeAppDirectory = path.posix.join("apps", `storefront-${slug}`);
  const appDirectory = path.join(repoRoot, relativeAppDirectory);

  if (!fs.existsSync(baseDirectory)) {
    throw new Error("storefront-base klasoru bulunamadi.");
  }

  fs.rmSync(appDirectory, { recursive: true, force: true });
  fs.cpSync(baseDirectory, appDirectory, {
    recursive: true,
    filter(source) {
      const baseName = path.basename(source);
      return baseName !== ".next" && baseName !== "node_modules";
    },
  });

  fs.writeFileSync(path.join(appDirectory, "package.json"), buildPackageJson(store.slug), "utf8");
  fs.writeFileSync(path.join(appDirectory, "tsconfig.json"), buildTsConfig(), "utf8");
  fs.writeFileSync(
    path.join(appDirectory, "next-env.d.ts"),
    "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n// Auto-generated by Celebix.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(appDirectory, ".env.example"),
    serializeEnv(buildStorefrontExampleEnv(store)),
    "utf8",
  );

  const adminEnvEntries = readExistingAdminEnvEntries(repoRoot, store);
  const envLocalEntries = {
    ...adminEnvEntries,
    ...buildStorefrontPublicEnv(store),
  };

  if (!envLocalEntries.NEXT_PUBLIC_SUPABASE_URL && store.supabase.url !== "configure-in-env") {
    envLocalEntries.NEXT_PUBLIC_SUPABASE_URL = store.supabase.url;
  }

  fs.writeFileSync(path.join(appDirectory, ".env.local"), serializeEnv(envLocalEntries), "utf8");

  replaceStorefrontPlaceholders(appDirectory, store);

  updateStoreStorefrontConfig(slug, {
    appDir: relativeAppDirectory,
    status: "scaffolded",
  });

  return {
    appDirectory,
    relativeAppDirectory,
  };
}
