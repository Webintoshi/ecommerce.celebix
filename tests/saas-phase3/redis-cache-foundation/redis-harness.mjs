import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import path from "node:path";

import { createCache } from "../../../packages/saas-cache/src/cache.ts";
import { createNodeRedisBackend } from "../../../packages/saas-cache/src/redis-client.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const IMAGE_TAG = "redis:8.10.1-alpine";
const IMAGE_DIGEST = "sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576";
const IMAGE = `${IMAGE_TAG}@${IMAGE_DIGEST}`;
const token = randomBytes(6).toString("hex");
const name = `celebix-redis-cache-harness-${token}`;
const password = randomBytes(24).toString("base64url");
const remotePort = 20_000 + Math.floor(Math.random() * 10_000);
const localPort = 30_000 + Math.floor(Math.random() * 10_000);
const sshHost = process.env.CELEBIX_REDIS_HARNESS_SSH_HOST;
const sshKey = process.env.CELEBIX_REDIS_HARNESS_SSH_KEY;
const localDocker = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
let tunnel;
let cache;
let completed = 0;

function pass(message) {
  completed += 1;
  process.stdout.write(`PASS ${completed}/10 ${message}\n`);
}

function docker(args, allowFailure = false) {
  const command = localDocker ? "docker" : "ssh";
  const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;
  const commandArgs = localDocker ? args : ["-i", sshKey ?? "", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", sshHost ?? "", `docker ${args.map(shellQuote).join(" ")}`];
  if (!localDocker && (!sshHost || !sshKey)) throw new Error("DISPOSABLE_REDIS_EXECUTION_BLOCKED");
  const result = spawnSync(command, commandArgs, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`disposable Redis command failed: ${String(result.stderr).trim()}`);
  return result.stdout.trim();
}

async function waitUntil(action, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await action(); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error("disposable Redis readiness timeout");
}

try {
  docker(["pull", IMAGE]);
  const imageInspection = JSON.parse(docker(["image", "inspect", IMAGE]));
  const repoDigest = imageInspection[0]?.RepoDigests?.[0]?.split("@").at(-1);
  assert.equal(repoDigest, IMAGE_DIGEST);
  pass("pinned official image digest verified");

  docker([
    "run", "-d", "--name", name,
    "-p", `127.0.0.1:${remotePort}:6379`,
    "--cpus", "0.5", "--cpu-shares", "512",
    "--memory", "768m", "--memory-reservation", "512m", "--memory-swap", "768m",
    IMAGE, "redis-server",
    "--requirepass", password,
    "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lfu",
    "--appendonly", "no", "--save", "", "--protected-mode", "yes",
    "--tcp-keepalive", "60", "--timeout", "0",
  ]);

  if (!localDocker) {
    tunnel = spawn("ssh", ["-i", sshKey, "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-N", "-L", `${localPort}:127.0.0.1:${remotePort}`, sshHost], { stdio: "ignore" });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 500);
      tunnel.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Redis harness tunnel exited: ${code}`)); });
    });
  }
  const port = localDocker ? remotePort : localPort;
  await waitUntil(() => new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(undefined); });
    socket.once("error", (error) => { socket.destroy(); reject(error); });
  }));
  const require = createRequire(new URL("../../../packages/saas-cache/package.json", import.meta.url));
  const { createClient } = require("redis");
  const unauthenticated = createClient({ url: `redis://127.0.0.1:${port}`, socket: { connectTimeout: 500, reconnectStrategy: false } });
  unauthenticated.on("error", () => undefined);
  await assert.rejects(() => unauthenticated.connect(), /NOAUTH/);
  if (unauthenticated.isOpen) await unauthenticated.destroy();
  pass("authentication rejects unauthenticated commands");

  const config = Object.freeze({
    enabled: true, required: false, url: `redis://default:${password}@127.0.0.1:${port}`,
    namespace: "celebix:harness", connectTimeoutMs: 500, commandTimeoutMs: 200,
    ttl: Object.freeze({ defaultSeconds: 3, catalogSeconds: 3, settingsSeconds: 3, negativeSeconds: 1 }), maxPayloadBytes: 262_144,
  });
  const backend = createNodeRedisBackend(config);
  let namespaceOrdinal = 0;
  cache = createCache({ backend, namespace: config.namespace, defaultTtlSeconds: 3, negativeTtlSeconds: 1, maxPayloadBytes: config.maxPayloadBytes, random: () => 0.5, randomToken: () => `namespace-${++namespaceOrdinal}` });
  await waitUntil(() => backend.ping());
  pass("authenticated client ping succeeds");

  const STORE_A = "11111111-1111-4111-8111-111111111111";
  const STORE_B = "22222222-2222-4222-8222-222222222222";
  let loads = 0;
  const read = (storeId, slug, load = async () => ({ value: ++loads })) => cache.readThrough({ storeId, dataClass: "catalog", schemaVersion: "v1", scope: "product", input: { slug }, parser: (value) => value, load });
  const cold = await read(STORE_A, "ring");
  const warm = await read(STORE_A, "ring");
  assert.deepEqual(warm, cold);
  assert.equal(loads, 1);
  pass("positive read-through produces a warm hit");

  await read(STORE_B, "ring");
  assert.equal(loads, 2);
  assert.equal(cache.metrics().hit, 1);
  pass("tenant-scoped keys isolate identical queries");

  let negativeLoads = 0;
  const negativeInput = { storeId: STORE_A, dataClass: "catalog", schemaVersion: "v1", scope: "missing-product", input: { slug: "missing" }, parser: (value) => value, load: async () => { negativeLoads += 1; return null; }, cacheNull: true };
  await cache.readThrough(negativeInput);
  await cache.readThrough(negativeInput);
  assert.equal(negativeLoads, 1);
  assert.equal(cache.metrics().negativeHit, 1);
  pass("negative result uses the bounded negative cache");

  await cache.rotateNamespace(STORE_A, "catalog");
  await read(STORE_A, "ring");
  assert.equal(loads, 3);
  pass("namespace rotation invalidates without key scans");

  const containerInspection = JSON.parse(docker(["inspect", name]));
  const configuration = JSON.stringify({ command: containerInspection[0]?.Config?.Cmd, limits: containerInspection[0]?.HostConfig }).toLowerCase();
  for (const expected of ["allkeys-lfu", "appendonly", "protected-mode", "536870912", "805306368"]) assert.match(configuration, new RegExp(expected));
  pass("cache-only memory and persistence-off controls are active");

  docker(["stop", "--time", "1", name]);
  let fallbackLoads = 0;
  const fallback = await waitUntil(() => cache.readThrough({ storeId: STORE_A, dataClass: "catalog", schemaVersion: "v1", scope: "outage", input: {}, parser: (value) => value, load: async () => ({ source: `postgres-${++fallbackLoads}` }) }), 5_000);
  assert.equal(fallback.source, "postgres-1");
  assert.equal(cache.metrics().error > 0, true);
  pass("Redis outage fails open to the authoritative loader");

  docker(["start", name]);
  await waitUntil(async () => { assert.equal(await cache.ping(), "healthy"); }, 20_000);
  const recovered = await read(STORE_A, "reconnected");
  assert.equal(typeof recovered.value, "number");
  pass("client reconnects after Redis restart without recreation");

  assert.equal(completed, 10);
  process.stdout.write("PASS 10/10 Redis cache foundation rehearsal complete\n");
} finally {
  await cache?.close().catch(() => undefined);
  tunnel?.kill("SIGTERM");
  docker(["rm", "-f", name], true);
}
