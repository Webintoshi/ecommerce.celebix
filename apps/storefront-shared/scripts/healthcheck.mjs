import { pathToFileURL } from "node:url";

const HEALTH_URL = "http://127.0.0.1:3450/health";
const DEFAULT_TIMEOUT_MS = 4_000;

export async function verifyStorefrontHealth({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetchImpl(HEALTH_URL, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status !== 200) return false;

    const payload = await response.json();
    return payload?.status === "ok" && payload?.service === "storefront-shared";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await verifyStorefrontHealth() ? 0 : 1;
}
