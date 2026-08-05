import { createHash } from "node:crypto";

import type { StoreDomainDnsInstruction, StoreDomainView, TenantContext } from "@celebix/saas-contracts";

import { CloudflareCustomHostnameError } from "./cloudflare.ts";
import { normalizeStorefrontHostname } from "./hostname.ts";
import type {
  CustomHostnameProvider,
  ProviderHostnameSnapshot,
  ProviderValidationInstruction,
  StoreDomainPersistence,
  StoreDomainServiceErrorCode,
  StoreDomainVersionedServiceInput,
  StorefrontHostnamePolicy,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PERSISTENCE_CODES = new Set([
  "invalid_input", "feature_not_enabled", "limit_reached", "hostname_already_claimed", "stale_version",
  "not_found", "operation_mismatch", "unavailable",
]);

export class StoreDomainServiceError extends Error {
  readonly code: StoreDomainServiceErrorCode;
  constructor(code: StoreDomainServiceErrorCode) {
    super(`store_domain_service_${code}`);
    this.name = "StoreDomainServiceError";
    this.code = code;
  }
}

function failure(code: StoreDomainServiceErrorCode): StoreDomainServiceError {
  return new StoreDomainServiceError(code);
}

function persistenceError(caught: unknown): never {
  if (caught && typeof caught === "object" && Object.getPrototypeOf(caught) !== null) {
    const code = (caught as { code?: unknown }).code;
    if (typeof code === "string" && PERSISTENCE_CODES.has(code)) {
      if (code === "unavailable") throw failure("provider_unavailable");
      throw failure(code as Exclude<StoreDomainServiceErrorCode, "provider_unavailable">);
    }
  }
  throw failure("provider_unavailable");
}

function dnsInstruction(value: ProviderValidationInstruction | null): StoreDomainDnsInstruction[] {
  if (value === null || value.type === "http") return [];
  return [Object.freeze({ type: value.type === "txt" ? "TXT" : "CNAME", name: value.name, value: value.value })];
}

function fingerprint(hostname: string): string {
  return createHash("sha256").update(JSON.stringify({ hostname, provider: "cloudflare_for_saas" })).digest("hex");
}

async function recoverProvider(
  provider: CustomHostnameProvider,
  hostname: string,
  create: boolean,
): Promise<ProviderHostnameSnapshot> {
  if (!create) {
    try {
      const existing = await provider.find(hostname);
      if (existing !== null) return existing;
    } catch (caught) {
      if (!(caught instanceof CloudflareCustomHostnameError)) throw failure("provider_unavailable");
      if (caught.code !== "not_found") throw failure("provider_unavailable");
    }
  }
  try {
    return await provider.create(hostname);
  } catch (caught) {
    if (!(caught instanceof CloudflareCustomHostnameError)) throw failure("provider_unavailable");
    if (caught.code !== "duplicate" && caught.code !== "unavailable" && caught.code !== "rate_limited") {
      throw caught.code === "invalid_input" ? failure("invalid_input") : failure("provider_unavailable");
    }
    try {
      const existing = await provider.find(hostname);
      if (existing !== null) return existing;
    } catch { /* contained below */ }
    throw failure("provider_unavailable");
  }
}

export type StoreDomainService = Readonly<{
  list(input: Readonly<{ tenantContext: TenantContext; now: Date }>): Promise<readonly StoreDomainView[]>;
  create(input: Readonly<{ tenantContext: TenantContext; now: Date; operationId: string; hostname: string }>): Promise<StoreDomainView>;
  requestRecheck(input: StoreDomainVersionedServiceInput): Promise<StoreDomainView>;
  makePrimary(input: StoreDomainVersionedServiceInput): Promise<StoreDomainView>;
  disable(input: StoreDomainVersionedServiceInput): Promise<StoreDomainView>;
}>;

export function createStoreDomainService(input: Readonly<{
  repository: StoreDomainPersistence;
  provider: CustomHostnameProvider;
  hostnamePolicy: StorefrontHostnamePolicy;
  generateId: () => string;
}>): StoreDomainService {
  if (!input || typeof input.generateId !== "function") throw failure("invalid_input");
  const { repository, provider, hostnamePolicy, generateId } = input;

  async function versioned(method: "requestRecheck" | "makePrimary" | "disable", selected: StoreDomainVersionedServiceInput) {
    try { return await repository[method](selected); } catch (caught) { return persistenceError(caught); }
  }

  return Object.freeze({
    async list(selected) {
      try { return await repository.list(selected); } catch (caught) { return persistenceError(caught); }
    },
    async create(selected) {
      if (!selected || !UUID.test(selected.operationId)) throw failure("invalid_input");
      let normalized;
      try { normalized = normalizeStorefrontHostname(selected.hostname, hostnamePolicy); }
      catch { throw failure("invalid_input"); }
      const domainId = generateId();
      if (!UUID.test(domainId)) throw failure("provider_unavailable");
      let prepared;
      try {
        prepared = await repository.prepareCreate({
          tenantContext: selected.tenantContext, now: selected.now, operationId: selected.operationId,
          fingerprint: fingerprint(normalized.hostname), domainId, hostname: normalized.hostname,
          provider: "cloudflare_for_saas", cnameTarget: hostnamePolicy.cnameTarget,
        });
      } catch (caught) { return persistenceError(caught); }
      if (prepared.replayed) {
        let current: readonly StoreDomainView[];
        try { current = await repository.list({ tenantContext: selected.tenantContext, now: selected.now }); }
        catch (caught) { return persistenceError(caught); }
        const durable = current.find((domain) => domain.id === prepared.domain.id);
        if (durable && durable.version > prepared.domain.version) return durable;
      }
      const providerSnapshot = await recoverProvider(provider, normalized.hostname, !prepared.replayed);
      if (providerSnapshot.hostname !== normalized.hostname) throw failure("provider_unavailable");
      try {
        return await repository.bindProvider({
          tenantContext: selected.tenantContext, now: selected.now, domainId: prepared.domain.id,
          expectedVersion: prepared.domain.version, providerHostnameId: providerSnapshot.providerHostnameId,
          ownershipValidation: dnsInstruction(providerSnapshot.ownershipValidation),
          certificateValidation: dnsInstruction(providerSnapshot.certificateValidation.find((item) => item.type !== "http") ?? null),
        });
      } catch (caught) { return persistenceError(caught); }
    },
    requestRecheck: (selected) => versioned("requestRecheck", selected),
    makePrimary: (selected) => versioned("makePrimary", selected),
    disable: (selected) => versioned("disable", selected),
  });
}
