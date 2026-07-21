import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);

test("default quick-link runtime stays disabled without approved staging authority", async () => {
  const moduleUrl = new URL("./default.ts", import.meta.url).href;
  const { stdout } = await execute(process.execPath, [
    "--conditions=react-server",
    "--experimental-transform-types",
    "--input-type=module",
    "--eval",
    `const module = await import(${JSON.stringify(moduleUrl)}); console.log(await module.resolveDefaultServerQuickLinksRuntime() === null ? "disabled" : "enabled");`,
  ], { env: { ...process.env, CELEBIX_SAAS_AUTH_MODE: "disabled", CELEBIX_DEPLOYMENT_TIER: "local" } });
  assert.equal(stdout.trim(), "disabled");
});

test("default resolution composes only the existing panel access runtime registry", async () => {
  const source = await readFile(new URL("./default.ts", import.meta.url), "utf8");
  assert.match(source, /resolveDefaultServerPanelAccessRuntime/);
  assert.match(source, /resolveServerQuickLinksRuntime/);
  assert.doesNotMatch(source, /process[.]env|CELEBIX_PAYTR|console[.]/);
});
