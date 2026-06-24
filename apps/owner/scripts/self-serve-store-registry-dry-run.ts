import fs from "node:fs";
import path from "node:path";
import {
  buildSelfServeRegistryMirror,
  type RegistryMirrorResult,
  type SourceRegistryEntry,
  type SourceStoreConfig,
} from "../lib/self-serve-store-registry-mapping";

interface CliOptions {
  repoRoot: string;
  format: "json" | "markdown";
  outputPath: string | null;
  knownExternalStoreSlugs: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repoRoot: process.cwd(),
    format: "json",
    outputPath: null,
    knownExternalStoreSlugs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--repo-root" && next) {
      options.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--format" && (next === "json" || next === "markdown")) {
      options.format = next;
      index += 1;
      continue;
    }

    if (arg === "--output" && next) {
      options.outputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--known-external-store" && next) {
      options.knownExternalStoreSlugs.push(...splitSlugList(next));
      index += 1;
      continue;
    }

    if (arg.startsWith("--known-external-store=")) {
      options.knownExternalStoreSlugs.push(...splitSlugList(arg.slice("--known-external-store=".length)));
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  options.knownExternalStoreSlugs = Array.from(new Set(options.knownExternalStoreSlugs)).sort();

  return options;
}

function splitSlugList(value: string): string[] {
  return value
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readRegistry(repoRoot: string): SourceRegistryEntry[] {
  const registryPath = path.join(repoRoot, "stores", "registry.json");

  if (!fs.existsSync(registryPath)) {
    return [];
  }

  const registry = readJsonFile<unknown>(registryPath);

  if (!Array.isArray(registry)) {
    throw new Error("stores/registry.json must be an array for the Phase 2A dry-run.");
  }

  return registry as SourceRegistryEntry[];
}

function readStoreConfigs(repoRoot: string): SourceStoreConfig[] {
  const storesDirectory = path.join(repoRoot, "stores");

  if (!fs.existsSync(storesDirectory)) {
    return [];
  }

  return fs
    .readdirSync(storesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(storesDirectory, entry.name, "store.config.json"))
    .filter((configPath) => fs.existsSync(configPath))
    .map((configPath) => readJsonFile<SourceStoreConfig>(configPath))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function toMarkdown(result: RegistryMirrorResult): string {
  const lines = [
    "# Self-Serve Store Registry Dry-Run",
    "",
    "This is a read-only local mapping report. It does not connect to production DB, apply SQL, mutate Logto, DNS, Coolify, or deploy anything.",
    "",
    "## Summary",
    "",
    `- Total source stores: ${result.summary.totalSourceStores}`,
    `- Proposed stores: ${result.summary.proposedStores}`,
    `- Proposed domains: ${result.summary.proposedDomains}`,
    `- Warnings: ${result.summary.warningCount}`,
    "",
    "## Proposed Stores",
    "",
    "| slug | name | status | databaseMode | sourceStatus |",
    "| --- | --- | --- | --- | --- |",
    ...result.stores.map((store) =>
      `| ${store.slug} | ${store.name} | ${store.status} | ${store.databaseMode} | ${store.sourceStatus ?? ""} |`,
    ),
    "",
    "## Proposed Domains",
    "",
    "| storeSlug | hostname | type | status | primary |",
    "| --- | --- | --- | --- | --- |",
    ...result.domains.map((domain) =>
      `| ${domain.storeSlug} | ${domain.hostname} | ${domain.domainType} | ${domain.status} | ${domain.isPrimary ? "yes" : "no"} |`,
    ),
    "",
    "## Warnings",
    "",
    ...result.warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function writeOutput(options: CliOptions, result: RegistryMirrorResult) {
  const output = options.format === "markdown" ? toMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`;

  if (!options.outputPath) {
    process.stdout.write(output);
    return;
  }

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, output, "utf8");
  process.stdout.write(`Wrote read-only dry-run report to ${options.outputPath}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const registryEntries = readRegistry(options.repoRoot);
  const storeConfigs = readStoreConfigs(options.repoRoot);
  const result = buildSelfServeRegistryMirror({
    registryEntries,
    storeConfigs,
    knownExternalStoreSlugs: options.knownExternalStoreSlugs,
  });

  writeOutput(options, result);
}

main();
