import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const NEXT_ENV = new URL("../next-env.d.ts", import.meta.url);
const NEXT_BIN = fileURLToPath(
  new URL("../../../node_modules/next/dist/bin/next", import.meta.url),
);

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitUntilReady(
  child: ChildProcessWithoutNullStreams,
  output: { value: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`next_dev_ready_timeout\n${output.value}`));
    }, 90_000);
    const inspect = (chunk: Buffer) => {
      output.value = `${output.value}${chunk.toString("utf8")}`.slice(-16_384);
      if (/Ready in/.test(output.value)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`next_dev_exited_${code ?? signal}\n${output.value}`));
    });
  });
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("actual Next catalog and inventory pages redirect the genuine signed-out runtime", async (t) => {
  const port = await availablePort();
  const output = { value: "" };
  const nextEnvironment = await readFile(NEXT_ENV);
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: APP_ROOT,
      env: { ...process.env, PANEL_SESSION_PERSISTENCE: "disabled" },
    },
  );
  t.after(async () => {
    await stop(child);
    await writeFile(NEXT_ENV, nextEnvironment);
  });
  await waitUntilReady(child, output);

  for (const pathname of [
    "/products/tags",
    "/products/barcode-labels",
    "/products/purchasing",
    "/products/purchasing/new",
    "/products/purchasing/11111111-1111-4111-8111-111111111111",
    "/products/inventory-counts",
    "/products/inventory-counts/new",
    "/products/inventory-counts/22222222-2222-4222-8222-222222222222",
    "/products/transfers",
    "/products/transfers/new",
    "/products/transfers/33333333-3333-4333-8333-333333333333",
  ] as const) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    assert.equal(response.status, 307, `${pathname}\n${output.value}`);
    assert.equal(response.headers.get("location"), "/login");
  }
});
