import {
  PostgresSaaSDataRepository,
  PostgresTenantOperationRecovery,
  assertNormalizedExactHostname,
  type CanonicalTenantFingerprint,
  type PostgresAuditEvent,
  type PostgresPoolLike,
  type PostgresTenantOperationRecoveryResult,
  type PostgresTimeoutOptions,
  type SaaSGeneratedIdKind,
} from "@celebix/saas-data";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import {
  createOwnerTenantCoreAdapter,
  createUnavailableOwnerTenantCoreAdapter,
  type OwnerTenantCoreAdapter,
} from "./adapter.ts";

const ACTIVATION_APPROVAL = Symbol("owner_postgres_activation_approval");

export type OwnerPostgresActivationEnvironment = "disposable_test" | "approved_staging";

export interface OwnerPostgresActivationApproval {
  readonly adapter: "postgres";
  readonly storeCreationApproved: true;
  readonly provisioningApproved: true;
  readonly environment: OwnerPostgresActivationEnvironment;
  readonly approvedByCompositionRoot: true;
  readonly [ACTIVATION_APPROVAL]: true;
}

export type OwnerTenantRecoveryOutcome =
  | { ok: true; value: PostgresTenantOperationRecoveryResult }
  | {
    ok: false;
    error: {
      schemaVersion: 1;
      code: "unauthenticated" | "invalid_input" | "service_unavailable";
      retryable: boolean;
    };
  };

export interface OwnerTenantRecoveryService {
  recover(request: Request, input: unknown): Promise<OwnerTenantRecoveryOutcome>;
}

export type OwnerSaaSTenantRuntime =
  | {
    kind: "disabled";
    tenantCore: OwnerTenantCoreAdapter;
    recovery: null;
  }
  | {
    kind: "postgres";
    tenantCore: OwnerTenantCoreAdapter;
    recovery: OwnerTenantRecoveryService;
  };

export interface PostgresOwnerSaaSTenantRuntimeOptions {
  pool: PostgresPoolLike;
  generateId(kind: SaaSGeneratedIdKind): string;
  panelOrigin: string;
  platformDomainSuffix: string;
  timeouts: PostgresTimeoutOptions;
  audit(event: PostgresAuditEvent): void | Promise<void>;
  activationApproval: OwnerPostgresActivationApproval;
  isTrustedRecoveryRequest(request: Request): Promise<boolean>;
}

function recoveryError(
  code: "unauthenticated" | "invalid_input" | "service_unavailable",
  retryable: boolean,
): OwnerTenantRecoveryOutcome {
  return { ok: false, error: { schemaVersion: 1, code, retryable } };
}

function isRecoveryInput(value: unknown): value is {
  idempotencyKey: string;
  fingerprint: CanonicalTenantFingerprint;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !("idempotencyKey" in record) ||
    !("fingerprint" in record) ||
    typeof record.idempotencyKey !== "string" ||
    record.idempotencyKey.length < 1 ||
    record.idempotencyKey.length > 128 ||
    record.idempotencyKey !== record.idempotencyKey.trim() ||
    typeof record.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.fingerprint)
  ) {
    return false;
  }
  return true;
}

function isApproved(value: OwnerPostgresActivationApproval): boolean {
  return Boolean(
    value &&
    value[ACTIVATION_APPROVAL] === true &&
    value.adapter === "postgres" &&
    value.storeCreationApproved === true &&
    value.provisioningApproved === true &&
    value.approvedByCompositionRoot === true &&
    (value.environment === "disposable_test" || value.environment === "approved_staging"),
  );
}

function assertValidRuntimeBounds(options: PostgresOwnerSaaSTenantRuntimeOptions): void {
  for (const value of Object.values(options.timeouts)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
      throw new Error("owner_postgres_runtime_invalid");
    }
  }
  try { assertNormalizedExactHostname(options.platformDomainSuffix); }
  catch { throw new Error("owner_postgres_runtime_invalid"); }
}

export function createOwnerPostgresActivationApproval(
  environment: OwnerPostgresActivationEnvironment,
): OwnerPostgresActivationApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") {
    throw new Error("owner_postgres_activation_not_approved");
  }
  return Object.freeze({
    adapter: "postgres",
    storeCreationApproved: true,
    provisioningApproved: true,
    environment,
    approvedByCompositionRoot: true,
    [ACTIVATION_APPROVAL]: true,
  } as const);
}

export function createDisabledOwnerSaaSTenantRuntime(): OwnerSaaSTenantRuntime {
  return {
    kind: "disabled",
    tenantCore: createUnavailableOwnerTenantCoreAdapter(),
    recovery: null,
  };
}

export function createPostgresOwnerSaaSTenantRuntime(
  options: PostgresOwnerSaaSTenantRuntimeOptions,
): OwnerSaaSTenantRuntime {
  if (!isApproved(options.activationApproval)) {
    throw new Error("owner_postgres_activation_not_approved");
  }
  assertValidRuntimeBounds(options);

  const repository = new PostgresSaaSDataRepository({
    pool: options.pool,
    generateId: options.generateId,
    audit: options.audit,
    timeouts: options.timeouts,
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: options.panelOrigin,
  });
  const recovery = new PostgresTenantOperationRecovery({
    pool: options.pool,
    timeouts: options.timeouts,
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: options.panelOrigin,
  });
  const service = createStarterTenantService({
    repository,
    platformDomainSuffix: options.platformDomainSuffix,
    panelBaseUrl: options.panelOrigin,
  });

  return {
    kind: "postgres",
    tenantCore: createOwnerTenantCoreAdapter(service),
    recovery: {
      recover: async (request, input) => {
        let trusted: boolean;
        try { trusted = await options.isTrustedRecoveryRequest(request); }
        catch { return recoveryError("service_unavailable", true); }
        if (!trusted) return recoveryError("unauthenticated", false);
        if (!isRecoveryInput(input)) return recoveryError("invalid_input", false);
        try {
          return {
            ok: true,
            value: await recovery.recover(input.idempotencyKey, input.fingerprint),
          };
        } catch {
          return recoveryError("service_unavailable", true);
        }
      },
    },
  };
}
