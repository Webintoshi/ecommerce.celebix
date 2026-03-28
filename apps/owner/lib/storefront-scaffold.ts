import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  requireStoreConfig,
  type StoreConfig,
  updateStoreStorefrontConfig
} from "@celebix/platform-config";

interface StorefrontScaffoldResult {
  appDirectory: string;
  relativeAppDirectory: string;
}

function toPackageName(slug: string): string {
  return `@celebix/storefront-${slug}`;
}

function buildLayoutSource(store: StoreConfig): string {
  const title = JSON.stringify(store.name);
  const description = JSON.stringify(store.branding?.tagline ?? `${store.name} storefront`);

  return `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: ${title},
  description: ${description}
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
`;
}

function buildHomePageSource(store: StoreConfig): string {
  const title = JSON.stringify(store.name);
  const tagline = JSON.stringify(store.branding?.tagline ?? `${store.name} icin yeni storefront klasoru hazir.`);
  const themeLabel = JSON.stringify(store.theme.label);
  const slug = JSON.stringify(store.slug);
  const storefrontDomain = JSON.stringify(store.domains.storefront);
  const adminDomain = JSON.stringify(store.domains.admin);

  return `export default function StorefrontHomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">{${themeLabel}}</span>
        <h1>{${title}}</h1>
        <p>{${tagline}}</p>
      </section>

      <section className="card-grid">
        <article className="card">
          <h2>Store slug</h2>
          <p>{${slug}}</p>
        </article>
        <article className="card">
          <h2>Storefront domain</h2>
          <p>{${storefrontDomain}}</p>
        </article>
        <article className="card">
          <h2>Admin domain</h2>
          <p>{${adminDomain}}</p>
        </article>
      </section>
    </main>
  );
}
`;
}

function buildGlobalCss(store: StoreConfig): string {
  return `:root {
  --bg: ${store.theme.surfaceColor};
  --text: #171717;
  --accent: ${store.theme.accentColor};
  --border: rgba(23, 23, 23, 0.12);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.8), transparent 35%),
    linear-gradient(180deg, #fff 0%, var(--bg) 100%);
  color: var(--text);
  font-family: ${store.theme.bodyFont};
}

.shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 48px 24px 72px;
}

.hero {
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
}

.eyebrow {
  display: inline-flex;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  margin: 16px 0 12px;
  font-size: clamp(40px, 8vw, 88px);
  line-height: 0.95;
  letter-spacing: -0.05em;
  font-family: ${store.theme.headingFont};
}

p {
  margin: 0;
  line-height: 1.7;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.72);
}

.card h2 {
  margin: 0 0 10px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 900px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

function buildPackageJson(store: StoreConfig): string {
  return `${JSON.stringify(
    {
      name: toPackageName(store.slug),
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next dev --port 3400",
        build: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next build",
        start: "cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next start --port 3400"
      },
      dependencies: {
        "cross-env": "^10.1.0",
        next: "16.2.1",
        react: "19.2.3",
        "react-dom": "19.2.3"
      },
      devDependencies: {
        "@types/node": "^24.6.0",
        "@types/react": "^19.2.2",
        "@types/react-dom": "^19.2.2",
        typescript: "^5.9.3"
      }
    },
    null,
    2
  )}\n`;
}

function buildTsConfig(): string {
  return `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        plugins: [{ name: "next" }]
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"]
    },
    null,
    2
  )}\n`;
}

export function scaffoldStorefrontApp(slug: string): StorefrontScaffoldResult {
  const store = requireStoreConfig(slug);
  const repoRoot = getRepoRoot();
  const relativeAppDirectory = path.posix.join("apps", `storefront-${slug}`);
  const appDirectory = path.join(repoRoot, relativeAppDirectory);

  if (!fs.existsSync(appDirectory)) {
    fs.mkdirSync(path.join(appDirectory, "app"), { recursive: true });
  }

  fs.writeFileSync(path.join(appDirectory, "package.json"), buildPackageJson(store), "utf8");
  fs.writeFileSync(path.join(appDirectory, "tsconfig.json"), buildTsConfig(), "utf8");
  fs.writeFileSync(path.join(appDirectory, "next-env.d.ts"), "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n// Auto-generated by Celebix.\n", "utf8");
  fs.writeFileSync(
    path.join(appDirectory, "next.config.ts"),
    "import type { NextConfig } from \"next\";\n\nconst nextConfig: NextConfig = {\n  poweredByHeader: false\n};\n\nexport default nextConfig;\n",
    "utf8"
  );
  fs.writeFileSync(path.join(appDirectory, "app", "layout.tsx"), buildLayoutSource(store), "utf8");
  fs.writeFileSync(path.join(appDirectory, "app", "page.tsx"), buildHomePageSource(store), "utf8");
  fs.writeFileSync(path.join(appDirectory, "app", "globals.css"), buildGlobalCss(store), "utf8");
  fs.writeFileSync(
    path.join(appDirectory, ".env.example"),
    `STORE_SLUG=${store.slug}\nNEXT_PUBLIC_SITE_URL=https://${store.domains.storefront}\nNEXT_PUBLIC_SUPABASE_URL=${store.supabase.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=configure-per-store\n`,
    "utf8"
  );

  updateStoreStorefrontConfig(slug, {
    appDir: relativeAppDirectory,
    status: "scaffolded"
  });

  return {
    appDirectory,
    relativeAppDirectory
  };
}
