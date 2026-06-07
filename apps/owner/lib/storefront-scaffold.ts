import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getConfiguredImageTransformationUrl,
  getRepoRoot,
  requireStoreConfig,
  resolveLightPostgresDefaultSslMode,
  resolveProvisionedNextBuildCpuCap,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  getExpectedStorefrontAppDir,
  getExpectedStorefrontPackageName,
  resolveStorefrontRepositoryBranch,
} from "../../../packages/platform-config/src/index";
import { applyStorefrontAuthorityPatch } from "@/lib/store-config-authority";
import { resolveLightPostgresDeploymentEnv } from "@/lib/light-postgres-deployment-env";
import {
  buildGeneratedRuntimeEnv,
  buildGeneratedRuntimeJson,
} from "@/lib/generated-app-standard";

interface StorefrontScaffoldResult {
  appDirectory: string;
  relativeAppDirectory: string;
}

interface GitHubContentEntry {
  type?: "file" | "dir";
  name?: string;
  path?: string;
  url?: string;
  content?: string;
  encoding?: string;
  download_url?: string | null;
  git_url?: string | null;
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
        "@celebix/payment-core": "0.1.0",
        "@celebix/platform-config": "0.1.0",
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
        iyzipay: "github:iyzico/iyzipay-node#v2.0.67",
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

function validateScaffoldedStorefront(
  slug: string,
  relativeAppDirectory: string,
  appDirectory: string,
): void {
  const expectedAppDir = getExpectedStorefrontAppDir(slug);

  if (relativeAppDirectory !== expectedAppDir) {
    throw new Error(`Storefront app yolu beklenen dizinle uyusmuyor: ${relativeAppDirectory}`);
  }

  if (!fs.existsSync(appDirectory)) {
    throw new Error("Scaffold tamamlandi ancak storefront dizini olusmadi.");
  }

  const packageJsonPath = path.join(appDirectory, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("Scaffold tamamlandi ancak package.json yazilamadi.");
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
  const expectedPackageName = getExpectedStorefrontPackageName(slug);

  if (packageJson.name?.trim() !== expectedPackageName) {
    throw new Error(
      `Storefront package name dogrulamasi basarisiz: ${packageJson.name || "bos"} (beklenen ${expectedPackageName})`,
    );
  }
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
    CELEBIX_NEXT_BUILD_CPUS: resolveProvisionedNextBuildCpuCap(3, ["CELEBIX_STOREFRONT_BUILD_CPUS"]),
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_STORE_SLUG: store.slug,
    DATABASE_MODE: store.databaseMode,
    NEXT_PUBLIC_SITE_URL: normalizeUrl(store.domains.storefront),
    NEXT_PUBLIC_ADMIN_URL: normalizeUrl(store.domains.admin),
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
    NEXT_PUBLIC_DEMO_DOMAIN: store.domains.demo,
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
  const lightPostgresSslMode = resolveLightPostgresDefaultSslMode();
  const databaseEnv: Record<string, string> =
    store.databaseMode === "full_supabase"
      ? {
          NEXT_PUBLIC_SUPABASE_URL:
            store.supabase.url !== "configure-in-env"
              ? store.supabase.url
              : "https://your-project-ref.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "configure-per-store",
          SUPABASE_SERVICE_ROLE_KEY: "configure-per-store-service-role",
        }
      : {
          ADMIN_DATABASE_MODE: "light_postgres",
          DATABASE_URL: "configure-per-store-database",
          DATABASE_DIRECT_URL: "configure-per-store-admin-database",
          DATABASE_POOL_MODE: "session",
          LIGHT_POSTGRES_DATABASE_NAME: store.lightPostgres?.databaseName || store.slug,
          LIGHT_POSTGRES_DATABASE_URL: "configure-per-store-database",
          LIGHT_POSTGRES_DATABASE_SSLMODE: lightPostgresSslMode,
          DATABASE_SSLMODE: lightPostgresSslMode,
          NEXT_PUBLIC_RUNTIME_DATABASE_MODE: "light_postgres",
          AUTH_SETUP_STATUS: "pending_auth_setup",
          NEXT_PUBLIC_AUTH_SETUP_STATUS: "pending_auth_setup",
        };

  return {
    ...buildStorefrontPublicEnv(store),
    ...buildGeneratedRuntimeEnv(store, "storefront"),
    NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL: getConfiguredImageTransformationUrl(),
    ...databaseEnv,
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

function getGitHubSyncToken(): string {
  const token = process.env.GITHUB_SYNC_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || "";

  if (!token) {
    throw new Error("storefront-base klasoru bulunamadi ve GITHUB_SYNC_TOKEN tanimli degil.");
  }

  return token;
}

function normalizeRepositoryIdentifier(raw: string): string {
  const value = raw.trim();

  if (!value) {
    throw new Error("GitHub repository bilgisi bos.");
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    return value;
  }

  const match = value.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (!match?.[1]) {
    throw new Error("GitHub repository bilgisi gecersiz.");
  }

  return match[1];
}

function getGitHubRepository(): string {
  return normalizeRepositoryIdentifier(
    process.env.GITHUB_SYNC_REPOSITORY?.trim() ||
      process.env.COOLIFY_APPLICATION_REPOSITORY_URL?.trim() ||
      process.env.CELEBIX_GIT_REPOSITORY?.trim() ||
      "Webintoshi/ecommerce.celebix",
  );
}

function getGitHubBranch(): string {
  return (
    process.env.GITHUB_SYNC_BRANCH?.trim() ||
    process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH?.trim() ||
    process.env.CELEBIX_GIT_BRANCH?.trim() ||
    "main"
  );
}

async function githubFetch<T>(pathname: string): Promise<T> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getGitHubSyncToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub template okunamadi (${response.status}): ${errorText || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function githubAbsoluteFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getGitHubSyncToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub blob template okunamadi (${response.status}): ${errorText || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function downloadGitHubBlob(gitUrl: string, fallbackDownloadUrl?: string | null): Promise<Buffer> {
  try {
    const payload = await githubAbsoluteFetch<GitHubContentEntry>(gitUrl);

    if (payload.content && (payload.encoding ?? "base64") === "base64") {
      return Buffer.from(payload.content.replace(/\n/g, ""), "base64");
    }
  } catch (error) {
    if (!fallbackDownloadUrl) {
      throw error;
    }
  }

  if (!fallbackDownloadUrl) {
    throw new Error("GitHub blob icerigi okunamadi.");
  }

  const rawResponse = await fetch(fallbackDownloadUrl, {
    headers: {
      Authorization: `Bearer ${getGitHubSyncToken()}`,
    },
    cache: "no-store",
  });

  if (!rawResponse.ok) {
    const errorText = await rawResponse.text();
    throw new Error(`GitHub raw template indirilemedi (${rawResponse.status}): ${errorText || rawResponse.statusText}`);
  }

  return Buffer.from(await rawResponse.arrayBuffer());
}

async function writeGitHubDirectoryRecursive(
  repository: string,
  branch: string,
  sourcePath: string,
  targetDirectory: string,
): Promise<void> {
  const encodedPath = sourcePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await githubFetch<GitHubContentEntry[] | GitHubContentEntry>(
    `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
  );

  if (Array.isArray(response)) {
    fs.mkdirSync(targetDirectory, { recursive: true });

    for (const entry of response) {
      if (!entry.type || !entry.name || !entry.path) {
        continue;
      }

      const nextTargetPath = path.join(targetDirectory, entry.name);

      if (entry.type === "dir") {
        await writeGitHubDirectoryRecursive(repository, branch, entry.path, nextTargetPath);
        continue;
      }

      if (entry.type === "file") {
        const fileResponse = await githubFetch<GitHubContentEntry>(
          `/repos/${repository}/contents/${encodeURIComponent(entry.path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`,
        );
        const content = fileResponse.content ?? "";
        const encoding = fileResponse.encoding ?? "base64";
        const downloadUrl = fileResponse.download_url || entry.download_url;
        const gitUrl = fileResponse.git_url || entry.git_url;

        if (!content && (gitUrl || downloadUrl)) {
          fs.mkdirSync(path.dirname(nextTargetPath), { recursive: true });
          fs.writeFileSync(nextTargetPath, await downloadGitHubBlob(gitUrl || "", downloadUrl));
          continue;
        }

        if (encoding !== "base64") {
          if (gitUrl || downloadUrl) {
            fs.mkdirSync(path.dirname(nextTargetPath), { recursive: true });
            fs.writeFileSync(nextTargetPath, await downloadGitHubBlob(gitUrl || "", downloadUrl));
            continue;
          }

          throw new Error(`GitHub template encoding desteklenmiyor: ${entry.path}`);
        }

        fs.mkdirSync(path.dirname(nextTargetPath), { recursive: true });
        fs.writeFileSync(nextTargetPath, Buffer.from(content.replace(/\n/g, ""), "base64"));
      }
    }

    return;
  }

  throw new Error("GitHub template dizini okunamadi.");
}

async function materializeBaseStorefrontDirectory(repoRoot: string): Promise<string> {
  const fallbackDirectory = path.join(repoRoot, ".generated", "storefront-base-template");
  fs.rmSync(fallbackDirectory, { recursive: true, force: true });
  await writeGitHubDirectoryRecursive(
    getGitHubRepository(),
    getGitHubBranch(),
    "apps/storefront-base",
    fallbackDirectory,
  );
  return fallbackDirectory;
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

export async function scaffoldStorefrontApp(slug: string): Promise<StorefrontScaffoldResult> {
  const store = requireStoreConfig(slug);
  const repoRoot = getRepoRoot();
  const localBaseDirectory = getBaseStorefrontDirectory(repoRoot);
  const baseDirectory = fs.existsSync(localBaseDirectory)
    ? localBaseDirectory
    : await materializeBaseStorefrontDirectory(repoRoot);
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
  fs.writeFileSync(
    path.join(appDirectory, "celebix.generated-runtime.json"),
    buildGeneratedRuntimeJson(store, "storefront"),
    "utf8",
  );

  const adminEnvEntries = readExistingAdminEnvEntries(repoRoot, store);
  const envLocalEntries = {
    ...adminEnvEntries,
    ...buildStorefrontPublicEnv(store),
    ...buildGeneratedRuntimeEnv(store, "storefront", adminEnvEntries),
  };

  if (store.databaseMode === "light_postgres") {
    const {
      runtimeDatabaseUrl,
      runtimeDatabaseName,
      runtimeSslMode,
    } = resolveLightPostgresDeploymentEnv(store, adminEnvEntries);

    envLocalEntries.ADMIN_DATABASE_MODE = "light_postgres";
    envLocalEntries.DATABASE_MODE = "light_postgres";
    envLocalEntries.LIGHT_POSTGRES_DATABASE_NAME = runtimeDatabaseName;
    envLocalEntries.LIGHT_POSTGRES_DATABASE_SSLMODE = runtimeSslMode;
    envLocalEntries.DATABASE_SSLMODE = runtimeSslMode;
    envLocalEntries.NEXT_PUBLIC_RUNTIME_DATABASE_MODE = "light_postgres";
    envLocalEntries.AUTH_SETUP_STATUS ||= "pending_auth_setup";
    envLocalEntries.NEXT_PUBLIC_AUTH_SETUP_STATUS ||= envLocalEntries.AUTH_SETUP_STATUS;

    if (runtimeDatabaseUrl) {
      envLocalEntries.DATABASE_URL = runtimeDatabaseUrl;
      envLocalEntries.DATABASE_DIRECT_URL = runtimeDatabaseUrl;
      envLocalEntries.LIGHT_POSTGRES_DATABASE_URL = runtimeDatabaseUrl;
    }
  }

  if (
    store.databaseMode === "full_supabase" &&
    !envLocalEntries.NEXT_PUBLIC_SUPABASE_URL &&
    store.supabase.url !== "configure-in-env"
  ) {
    envLocalEntries.NEXT_PUBLIC_SUPABASE_URL = store.supabase.url;
  }

  if (!envLocalEntries.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL) {
    envLocalEntries.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL =
      getConfiguredImageTransformationUrl();
  }

  fs.writeFileSync(path.join(appDirectory, ".env.local"), serializeEnv(envLocalEntries), "utf8");

  replaceStorefrontPlaceholders(appDirectory, store);

  validateScaffoldedStorefront(slug, relativeAppDirectory, appDirectory);
  await applyStorefrontAuthorityPatch(slug, {
    appDir: relativeAppDirectory,
    status: "scaffolded",
    lastScaffoldedAt: new Date().toISOString(),
    lastScaffoldError: null,
    deploymentBranch: resolveStorefrontRepositoryBranch(slug),
  });

  return {
    appDirectory,
    relativeAppDirectory,
  };
}
