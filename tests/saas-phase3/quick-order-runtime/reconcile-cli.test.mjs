import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const root = path.resolve(new URL("../../../", import.meta.url).pathname);
const storefront = path.join(root, "apps", "storefront-shared");

function childResult(command, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, options);
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("reconciliation package command is exact and missing server authority fails closed before database or provider I/O", async () => {
  const manifest = JSON.parse(await readFile(path.join(storefront, "package.json"), "utf8"));
  assert.equal(manifest.scripts["reconcile:quick-orders"],
    "NODE_OPTIONS='--conditions=react-server' node scripts/reconcile-quick-orders.mjs");

  let sockets = 0;
  const trap = createServer((socket) => { sockets += 1; socket.destroy(); });
  await new Promise((resolve, reject) => { trap.once("error", reject); trap.listen(0, "127.0.0.1", resolve); });
  const address = trap.address();
  assert.ok(address && typeof address === "object");
  try {
    const result = await childResult("npm", ["run", "reconcile:quick-orders", "--silent"], {
      cwd: storefront,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CELEBIX_SAAS_DATABASE_URL: `postgresql://workflow:secret@127.0.0.1:${address.port}/celebix_saas_staging?sslmode=require`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(result.signal, null);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, '{"status":"failed","claimed":0,"settled":0,"unknown":0,"failures":1}\n');
    assert.equal(sockets, 0);
  } finally {
    await new Promise((resolve) => trap.close(resolve));
  }
});
