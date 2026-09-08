// Read-only source replay for the two Owner consumer failures. No checkout,
// metadata generation, environment mutation, database or provider transport.
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const base = "ad2c7d479457fcc2ad0595d32476efebab20fe6d";
registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith("file:")) return nextLoad(url, context);
    const file = fileURLToPath(url);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || relative.includes("node_modules/") || !/\.(?:ts|mjs)$/.test(relative)
      || relative.startsWith("docs/qa/")) return nextLoad(url, context);
    const source = execFileSync("git", ["show", `${base}:${relative}`], { cwd: root, encoding: "utf8" });
    return {
      format: "module", shortCircuit: true,
      source: relative.endsWith(".ts") ? stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url }) : source,
    };
  },
});
