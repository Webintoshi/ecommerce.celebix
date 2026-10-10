import { LuckyWheelContractError, parseLuckyWheelSpinRequest } from "@celebix/saas-contracts";
import { LuckyWheelRepositoryError } from "@celebix/saas-data";
import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { LuckyWheelRuntimeError, type LuckyWheelRuntime } from "./runtime.ts";
import { serializeWheelOperationCookie } from "./credential.ts";

type Dependencies = Readonly<{ selectAuthority(headers: Headers): TrustedStorefrontHostAuthority; resolveRuntime(): Promise<LuckyWheelRuntime | null>; allowSpin?(hostname: string, headers: Headers): boolean }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function json(value: unknown, status = 200, cookie?: string) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...(cookie ? { "set-cookie": cookie } : {}) } }); }
function failure(error: unknown) {
  if (error instanceof LuckyWheelContractError) return json({ code: "invalid_input" }, 400);
  if (error instanceof LuckyWheelRuntimeError) return json({ code: error.code }, error.code === "invalid_input" ? 400 : 503);
  if (error instanceof LuckyWheelRepositoryError) {
    const code = error.code, status = code === "invalid_input" ? 400 : code === "not_found" ? 404 : code === "rate_limited" ? 429 : ["version_conflict", "operation_mismatch", "campaign_unavailable", "quota_exhausted", "repeat_limited"].includes(code) ? 409 : 503;
    return json({ code: status === 503 && code !== "commit_uncertain" ? "unavailable" : code }, status);
  }
  return json({ code: "unavailable" }, 503);
}
function authorize(deps: Dependencies, request: Request, path: string, method: string, query = false): { hostname: string; url: URL } | Response {
  let selected; try { selected = deps.selectAuthority(request.headers); } catch { return json({ code: "unavailable" }, 503); }
  if (selected.kind !== "trusted") return json({ code: "unavailable" }, 503);
  let url; try { url = new URL(request.url); } catch { return json({ code: "invalid_input" }, 400); }
  if (request.method !== method || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== path || (!query && url.search) || url.hash) return json({ code: "invalid_input" }, 400);
  if (method === "POST" && request.headers.get("origin") !== `https://${selected.hostname}`) return json({ code: "origin_denied" }, 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ code: "origin_denied" }, 403);
  for (const name of request.headers.keys()) if (name === "authorization" || name.startsWith("x-store-") || name.startsWith("x-tenant-") || name.startsWith("x-customer-") || name === "x-principal-id" || name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy") return json({ code: "invalid_input" }, 400);
  return { hostname: selected.hostname, url };
}
async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || !request.body) throw new LuckyWheelRuntimeError();
  const length = request.headers.get("content-length"); if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 2048)) throw new LuckyWheelRuntimeError();
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2048) { await reader.cancel(); throw new LuckyWheelRuntimeError(); } chunks.push(part.value); } const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new LuckyWheelRuntimeError(); }
}
export function createLuckyWheelRoutes(deps: Dependencies) {
  const resolve = async () => { try { return await deps.resolveRuntime(); } catch { return null; } };
  return Object.freeze({
    async settings(request: Request) { const scope = authorize(deps, request, "/api/lucky-wheel/settings", "GET"); if (scope instanceof Response) return scope; const runtime = await resolve(); if (!runtime) return json({ code: "unavailable" }, 503); try { const result = await runtime.publicSettings(scope.hostname, request.headers.get("cookie")); return json(result.settings, 200, result.setCookie ?? undefined); } catch (error) { return failure(error); } },
    async spin(request: Request) {
      const scope = authorize(deps, request, "/api/lucky-wheel/spin", "POST"); if (scope instanceof Response) return scope;
      let input; try { input = parseLuckyWheelSpinRequest(await body(request)); if (request.headers.get("idempotency-key") !== input.operationId) throw new LuckyWheelRuntimeError(); } catch (error) { return failure(error); }
      if (deps.allowSpin && !deps.allowSpin(scope.hostname, request.headers)) return json({ code: "rate_limited" }, 429);
      const runtime = await resolve(); if (!runtime) return json({ code: "unavailable" }, 503);
      try { const result = await runtime.spin(scope.hostname, request.headers.get("cookie"), input); return json(result, 200, serializeWheelOperationCookie(result)); } catch (error) { return failure(error); }
    },
    async result(request: Request) {
      const scope = authorize(deps, request, "/api/lucky-wheel/result", "GET", true); if (scope instanceof Response) return scope;
      const keys = [...scope.url.searchParams.keys()], campaignId = scope.url.searchParams.get("campaignId"), operationId = scope.url.searchParams.get("operationId");
      if (!campaignId || !UUID.test(campaignId) || operationId !== null && !UUID.test(operationId) || keys.length !== new Set(keys).size || keys.some(key => !["campaignId", "operationId"].includes(key))) return json({ code: "invalid_input" }, 400);
      const runtime = await resolve(); if (!runtime) return json({ code: "unavailable" }, 503);
      try { const result = await runtime.result(scope.hostname, request.headers.get("cookie"), { campaignId, ...(operationId ? { operationId } : {}) }); return json(result, 200, result ? serializeWheelOperationCookie(result) : undefined); } catch (error) { return failure(error); }
    },
  });
}
