"use client";

import { parseOrderBumpPublicOffers, type OrderBumpPublicOffers } from "@celebix/saas-contracts";
type Fetcher = (path: string, init: RequestInit) => Promise<Response>;
const MAXIMUM_BYTES = 32_768;

async function payload(response: Response): Promise<OrderBumpPublicOffers> {
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || !response.body) throw new Error("order_bumps_unavailable");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > MAXIMUM_BYTES)) throw new Error("order_bumps_unavailable");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BYTES) { await reader.cancel().catch(() => undefined); throw new Error("order_bumps_unavailable"); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return parseOrderBumpPublicOffers(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } finally { reader.releaseLock(); }
}

export function createOrderBumpReader(fetcher: Fetcher = fetch, timeoutMs = 2_500) {
  return async function read(placement: "side_cart" | "checkout", signal?: AbortSignal): Promise<OrderBumpPublicOffers> {
    if (!["side_cart", "checkout"].includes(placement) || signal?.aborted) throw new Error("order_bumps_unavailable");
    const controller = new AbortController();
    let reject!: (reason: Error) => void;
    const cancelled = new Promise<never>((_, rejectRequest) => { reject = rejectRequest; });
    const abort = () => { controller.abort(); reject(new Error("order_bumps_unavailable")); };
    const timer = setTimeout(abort, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    try { return await Promise.race([fetcher(`/api/order-bumps?placement=${placement}`, { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(payload), cancelled]); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  };
}
export const readOrderBumpOffers = createOrderBumpReader();
