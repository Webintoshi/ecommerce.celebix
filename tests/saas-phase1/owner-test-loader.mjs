import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ownerRoot = new URL("../../apps/owner/", import.meta.url);
const repositoryRoot = new URL("../../", import.meta.url);
const sourceCandidates = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

async function existingSourceUrl(baseUrl) {
  for (const suffix of sourceCandidates) {
    const candidate = new URL(`${baseUrl.href}${suffix}`);
    try {
      await access(fileURLToPath(candidate));
      return candidate.href;
    } catch {
      // Continue to the next explicit TypeScript source candidate.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let baseUrl = null;
  if (specifier.startsWith("next/") && !specifier.endsWith(".js")) {
    const nextSubpath = new URL(`node_modules/${specifier}.js`, repositoryRoot);
    try {
      await access(fileURLToPath(nextSubpath));
      return { url: nextSubpath.href, shortCircuit: true };
    } catch {
      // Let Node report unsupported Next subpaths through normal resolution.
    }
  }
  if (specifier.startsWith("@/")) {
    baseUrl = new URL(specifier.slice(2), ownerRoot);
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    baseUrl = new URL(specifier, context.parentURL);
  }

  if (baseUrl && !/\.[cm]?[jt]sx?$/.test(baseUrl.pathname)) {
    const sourceUrl = await existingSourceUrl(baseUrl);
    if (sourceUrl) return { url: sourceUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
