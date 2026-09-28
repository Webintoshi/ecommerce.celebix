import type { StoreDomainOriginHealthRepository } from "@celebix/saas-data";
import type { TrustedStorefrontHostAuthority } from "./trusted-host-authority.ts";

export type StorefrontSetupPaymentAvailability = Readonly<{
  kind: "ready" | "disabled" | "unavailable";
  providers: readonly Readonly<{ providerCode: "paytr_iframe" | "iyzico_iframe"; environment: "test" | "live"; adapterVersion: number; evidenceDigest: string }>[];
}>;
const UNAVAILABLE = Object.freeze({ kind: "unavailable" as const, providers: Object.freeze([]) });
const HEADERS = Object.freeze({"cache-control":"no-store", "referrer-policy":"no-referrer", "x-content-type-options":"nosniff"});

function safeAvailability(value: StorefrontSetupPaymentAvailability): StorefrontSetupPaymentAvailability {
  if (!value || !["ready","disabled","unavailable"].includes(value.kind) || !Array.isArray(value.providers) || value.providers.length > 3) return UNAVAILABLE;
  const pairs = new Set<string>();
  for (const entry of value.providers) {
    if (!entry || !["paytr_iframe","iyzico_iframe"].includes(entry.providerCode) || !["test","live"].includes(entry.environment)
      || (entry.providerCode === "iyzico_iframe" && entry.environment === "live") || pairs.has(`${entry.providerCode}:${entry.environment}`)
      || !Number.isSafeInteger(entry.adapterVersion) || entry.adapterVersion < 1 || typeof entry.evidenceDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.evidenceDigest)) return UNAVAILABLE;
    pairs.add(`${entry.providerCode}:${entry.environment}`);
  }
  if ((value.kind === "ready") !== (value.providers.length > 0)) return UNAVAILABLE;
  return Object.freeze({kind:value.kind,providers:Object.freeze(value.providers.map(({providerCode,environment,adapterVersion,evidenceDigest})=>Object.freeze({providerCode,environment,adapterVersion,evidenceDigest})))});
}

export function createStorefrontSetupCapabilitiesRoute(dependencies: Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRepository(): Promise<Pick<StoreDomainOriginHealthRepository,"get"> | null>;
  paymentAvailability(): Promise<StorefrontSetupPaymentAvailability>;
  now(): Date;
}>) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/setup-capabilities" || url.search || url.hash) return Response.json({code:"storefront_not_found"},{status:404,headers:HEADERS});
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted") return Response.json({code:"storefront_not_found"},{status:404,headers:HEADERS});
    try {
      const repository = await dependencies.resolveRepository();
      if (!repository) throw new Error("unavailable");
      const marker = await repository.get({hostname:authority.hostname,now:dependencies.now()});
      if (marker.schemaVersion !== 1 || marker.status !== "ok" || marker.hostname !== authority.hostname || !marker.storeId) throw new Error("unavailable");
      let payment: StorefrontSetupPaymentAvailability = UNAVAILABLE;
      try { payment = safeAvailability(await dependencies.paymentAvailability()); } catch { /* Keep an unavailable read distinct from disabled execution. */ }
      return Response.json({schemaVersion:1,storeId:marker.storeId,hostname:marker.hostname,payment},{status:200,headers:HEADERS});
    } catch {
      return Response.json({code:"storefront_unavailable"},{status:503,headers:HEADERS});
    }
  };
}
