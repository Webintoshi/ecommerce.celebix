import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];
    args[key] = value;
    index += 1;
  }

  return args;
}

function ensureSlug(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Slug sadece kucuk harf, rakam ve tire icermelidir.");
  }
}

function buildAdminEnvTemplate({ slug, domain }) {
  return [
    `STORE_SLUG=${slug}`,
    "",
    "NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
    "",
    `NEXT_PUBLIC_SITE_URL=https://${domain}`,
    `NEXT_PUBLIC_ADMIN_URL=https://admin.${domain}`,
    "",
    "R2_ACCOUNT_ID=your-r2-account-id",
    "R2_ACCESS_KEY_ID=your-r2-access-key",
    "R2_SECRET_ACCESS_KEY=your-r2-secret",
    "R2_BUCKET_NAME=your-r2-bucket",
    `R2_PUBLIC_URL=https://cdn.${domain}`,
    ""
  ].join("\n");
}

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const storesDir = path.join(rootDir, "stores");
const registryPath = path.join(storesDir, "registry.json");
const args = readArgs(process.argv.slice(2));

const name = args.name;
const slug = args.slug;
const domain = args.domain;
const theme = args.theme ?? "atelier";

if (!name || !slug || !domain) {
  throw new Error('Kullanim: npm run create:store -- --name "Deri Kordon" --slug deri-kordon --domain deri-kordon.com --theme leather');
}

ensureSlug(slug);

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

if (registry.some((store) => store.slug === slug)) {
  throw new Error(`"${slug}" zaten kayitli.`);
}

registry.push({
  slug,
  name,
  domain,
  theme,
  status: "draft"
});

registry.sort((left, right) => left.name.localeCompare(right.name, "tr"));
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

const storeDir = path.join(storesDir, slug);
fs.mkdirSync(storeDir, { recursive: true });

const config = {
  name,
  slug,
  status: "draft",
  theme: {
    key: theme,
    label: theme[0].toUpperCase() + theme.slice(1),
    primaryColor: "#1f2937",
    accentColor: "#ea580c",
    surfaceColor: "#f8fafc",
    headingFont: "\"Times New Roman\", serif",
    bodyFont: "system-ui, sans-serif"
  },
  domains: {
    storefront: domain,
    admin: `admin.${domain}`
  },
  owner: {
    createdBy: "cli-bootstrap",
    notes: "CLI uzerinden olusturuldu."
  },
  supabase: {
    projectRef: "pending-owner-bootstrap",
    url: "configure-in-env",
    storage: "separate-project-per-store"
  },
  bootstrap: {
    createdAt: new Date().toISOString(),
    envTemplatePath: `stores/${slug}/admin.env.example`,
    supabaseProvisioning: "pending-owner-env"
  },
  features: [
    "catalog",
    "orders",
    "customers",
    "discounts",
    "cms",
    "frontend_from_existing_store"
  ]
};

fs.writeFileSync(path.join(storeDir, "store.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(storeDir, "admin.env.example"), buildAdminEnvTemplate({ slug, domain }), "utf8");
console.log(`Magaza olusturuldu: ${name} (${slug})`);
