import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OWNER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(OWNER_ROOT, "../..");

function sourceUrl(root, relativePath) {
  const extension = path.extname(relativePath) ? "" : ".ts";
  return pathToFileURL(path.join(root, `${relativePath}${extension}`)).href;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    return { url: sourceUrl(OWNER_ROOT, specifier.slice(2)), shortCircuit: true };
  }
  if (specifier.startsWith("@celebix/platform-config/src/")) {
    return {
      url: sourceUrl(
        path.join(REPO_ROOT, "packages/platform-config/src"),
        specifier.slice("@celebix/platform-config/src/".length),
      ),
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
