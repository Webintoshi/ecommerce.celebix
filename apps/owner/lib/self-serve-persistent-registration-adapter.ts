import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { getMissingOwnerSupabaseEnvNames } from "@/lib/owner-supabase-shared";
import {
  getSelfServeFeatureFlags,
  getSelfServePersistenceMode,
  type SelfServeFeatureFlags,
} from "@/lib/self-serve-flags";
import {
  buildSelfServeRegistrationRecord,
  normalizeSelfServeRegistrationInput,
  validateSelfServeRegistrationInput,
  type SelfServeCreationState,
  type SelfServePersistentCreationArtifacts,
  type SelfServeRegistrationInput,
  type SelfServeRegistrationRecord,
} from "@/lib/self-serve-registration";

type SelfServePersistentFailure = {
  ok: false;
  status: number;
  code: string;
  errors: string[];
  missingEnv?: string[];
  fieldErrors?: ReturnType<typeof validateSelfServeRegistrationInput>;
};

type SelfServePersistentSuccess = {
  ok: true;
  request: SelfServeRegistrationRecord;
  persistenceMode: "persistent_db_adapter";
  freeStarterStoreEnabled: boolean;
  autoProvisioningEnabled: boolean;
  storeCreateEnabled: boolean;
  provisioningEnabled: boolean;
  idempotent: boolean;
  creation: SelfServeCreationState;
};

export type SelfServePersistentRegistrationResult = SelfServePersistentSuccess | SelfServePersistentFailure;

export type PersistentRegistrationBundleInput = {
  request: SelfServeRegistrationRecord;
  normalized: SelfServeRegistrationInput;
  idempotencyKey: string;
};

export interface SelfServePersistentRegistrationAdapter {
  findByEmailAndSlug(email: string, slug: string): Promise<SelfServeRegistrationRecord | null>;
  findBySlug(slug: string): Promise<SelfServeRegistrationRecord | null>;
  countByEmail(email: string): Promise<number>;
  createRegistrationBundle(input: PersistentRegistrationBundleInput): Promise<{
    request: SelfServeRegistrationRecord;
    provisioningJob: SelfServePersistentCreationArtifacts["provisioningJob"];
  }>;
}

type RegistrationRow = {
  id: string;
  normalized_email: string;
  store_slug: string;
  store_name: string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_phone: string;
  marketing_consent: boolean;
  privacy_consent: boolean;
  planned_store_url: string;
  planned_admin_url: string;
  metadata: {
    request?: SelfServeRegistrationRecord;
  } | null;
  created_at: string | null;
};

function createRequestId() {
  return crypto.randomUUID();
}

function createIdempotencyKey(email: string, slug: string) {
  return `${email}::${slug}`;
}

function buildPersistentCreationState(input: {
  idempotent: boolean;
  provisioningJob: SelfServePersistentCreationArtifacts["provisioningJob"];
}): SelfServeCreationState {
  return {
    mode: "persistent_db_adapter",
    status: "persistent_records_prepared",
    idempotent: input.idempotent,
    artifacts: {
      provisioningJob: input.provisioningJob,
    },
  };
}

function buildPersistentJobArtifact(registrationId: string, id = registrationId): SelfServePersistentCreationArtifacts["provisioningJob"] {
  return {
    id,
    adapter: "persistent_db_adapter",
    status: "queued",
    kind: "free_starter_store_creation",
  };
}

function mapRegistrationRowToRecord(row: RegistrationRow, flags: SelfServeFeatureFlags): SelfServeRegistrationRecord {
  if (row.metadata?.request) {
    return row.metadata.request;
  }

  return buildSelfServeRegistrationRecord(
    row.id,
    {
      firstName: row.applicant_first_name,
      lastName: row.applicant_last_name,
      storeName: row.store_name,
      storeSlug: row.store_slug,
      phone: row.applicant_phone,
      email: row.normalized_email,
      password: "Password1",
      marketingConsent: row.marketing_consent,
      privacyConsent: row.privacy_consent,
    },
    {
      now: row.created_at ? new Date(row.created_at) : undefined,
      defaultDomainSuffix: flags.defaultDomainSuffix,
      autoProvisioningEnabled: flags.autoProvisioningEnabled,
      requirePaymentBeforePublic: flags.requirePaymentBeforePublic,
      requireEmailVerification: flags.requireEmailVerification,
    },
  );
}

export function getSelfServePersistentAdapterReadiness() {
  const missingEnv = getMissingOwnerSupabaseEnvNames({ requireServiceRole: true });

  if (missingEnv.length > 0) {
    return {
      ok: false as const,
      missingEnv,
    };
  }

  return {
    ok: true as const,
    missingEnv: [],
  };
}

export class SupabaseSelfServePersistentRegistrationAdapter implements SelfServePersistentRegistrationAdapter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly flags: SelfServeFeatureFlags,
  ) {}

  async findByEmailAndSlug(email: string, slug: string): Promise<SelfServeRegistrationRecord | null> {
    const { data, error } = await this.client
      .from("self_serve_store_registrations")
      .select("*")
      .eq("normalized_email", email)
      .eq("store_slug", slug)
      .maybeSingle<RegistrationRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapRegistrationRowToRecord(data, this.flags) : null;
  }

  async findBySlug(slug: string): Promise<SelfServeRegistrationRecord | null> {
    const { data, error } = await this.client
      .from("self_serve_store_registrations")
      .select("*")
      .eq("store_slug", slug)
      .maybeSingle<RegistrationRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapRegistrationRowToRecord(data, this.flags) : null;
  }

  async countByEmail(email: string): Promise<number> {
    const { count, error } = await this.client
      .from("self_serve_store_registrations")
      .select("id", { count: "exact", head: true })
      .eq("normalized_email", email);

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }

  async createRegistrationBundle(input: PersistentRegistrationBundleInput) {
    const registrationPayload = {
      id: input.request.id,
      normalized_email: input.normalized.email,
      store_slug: input.normalized.storeSlug,
      store_name: input.normalized.storeName,
      applicant_first_name: input.normalized.firstName,
      applicant_last_name: input.normalized.lastName,
      applicant_phone: input.normalized.phone,
      marketing_consent: input.normalized.marketingConsent,
      privacy_consent: input.normalized.privacyConsent,
      plan: "free_starter",
      creation_mode: "production_safe_pending",
      status: "processing",
      planned_store_url: input.request.store.plannedStoreUrl,
      planned_admin_url: input.request.store.plannedAdminUrl,
      auth_provider: "logto",
      password_stored: false,
      idempotency_key: input.idempotencyKey,
      metadata: {
        schemaVersion: 1,
        request: input.request,
      },
    };

    const { error: registrationError } = await this.client
      .from("self_serve_store_registrations")
      .insert(registrationPayload);

    if (registrationError) {
      throw new Error(registrationError.message);
    }

    const { error: packageError } = await this.client.from("self_serve_store_packages").insert({
      registration_id: input.request.id,
      plan: "free_starter",
      status: "pending",
    });

    if (packageError) {
      throw new Error(packageError.message);
    }

    const { error: domainsError } = await this.client.from("self_serve_store_domains").insert([
      {
        registration_id: input.request.id,
        hostname: input.request.store.proposedDomain,
        domain_type: "platform_subdomain",
        is_primary: true,
        status: "planned",
      },
      {
        registration_id: input.request.id,
        hostname: `admin-${input.request.store.proposedDomain}`,
        domain_type: "admin_subdomain",
        is_primary: true,
        status: "planned",
      },
    ]);

    if (domainsError) {
      throw new Error(domainsError.message);
    }

    const { error: membershipError } = await this.client.from("self_serve_store_memberships").insert({
      registration_id: input.request.id,
      principal_email: input.normalized.email,
      role: "store_owner",
      status: "pending",
    });

    if (membershipError) {
      throw new Error(membershipError.message);
    }

    const provisioningJob = buildPersistentJobArtifact(input.request.id, crypto.randomUUID());
    const { error: jobError } = await this.client.from("self_serve_provisioning_jobs").insert({
      id: provisioningJob.id,
      registration_id: input.request.id,
      kind: provisioningJob.kind,
      status: provisioningJob.status,
      adapter: provisioningJob.adapter,
      safe_metadata: {
        schemaVersion: 1,
        storeSlug: input.request.store.slug,
      },
    });

    if (jobError) {
      throw new Error(jobError.message);
    }

    return {
      request: input.request,
      provisioningJob,
    };
  }
}

export function createSupabaseSelfServePersistentRegistrationAdapter(flags = getSelfServeFeatureFlags()) {
  const readiness = getSelfServePersistentAdapterReadiness();

  if (!readiness.ok) {
    return {
      ok: false as const,
      missingEnv: readiness.missingEnv,
    };
  }

  return {
    ok: true as const,
    adapter: new SupabaseSelfServePersistentRegistrationAdapter(createOwnerServiceClient(), flags),
  };
}

export function createInMemorySelfServePersistentRegistrationAdapter() {
  const registrations: SelfServeRegistrationRecord[] = [];
  const provisioningJobs: SelfServePersistentCreationArtifacts["provisioningJob"][] = [];

  const adapter: SelfServePersistentRegistrationAdapter & {
    snapshot(): {
      registrations: SelfServeRegistrationRecord[];
      provisioningJobs: SelfServePersistentCreationArtifacts["provisioningJob"][];
    };
  } = {
    async findByEmailAndSlug(email, slug) {
      return registrations.find((request) => request.applicant.email === email && request.store.slug === slug) ?? null;
    },
    async findBySlug(slug) {
      return registrations.find((request) => request.store.slug === slug) ?? null;
    },
    async countByEmail(email) {
      return registrations.filter((request) => request.applicant.email === email).length;
    },
    async createRegistrationBundle(input) {
      registrations.unshift(input.request);
      const provisioningJob = buildPersistentJobArtifact(input.request.id, crypto.randomUUID());
      provisioningJobs.unshift(provisioningJob);

      return {
        request: input.request,
        provisioningJob,
      };
    },
    snapshot() {
      return {
        registrations: [...registrations],
        provisioningJobs: [...provisioningJobs],
      };
    },
  };

  return adapter;
}

export async function createSelfServeDirectPersistentRegistration(
  input: SelfServeRegistrationInput,
  options?: {
    adapter?: SelfServePersistentRegistrationAdapter;
    flags?: SelfServeFeatureFlags;
  },
): Promise<SelfServePersistentRegistrationResult> {
  const flags = options?.flags ?? getSelfServeFeatureFlags();

  if (!flags.signupEnabled || !flags.directRegistrationEnabled) {
    return {
      ok: false,
      status: 503,
      code: "self_serve_direct_registration_disabled",
      errors: ["Self-serve direkt kayit akisi su anda kapali."],
    };
  }

  if (getSelfServePersistenceMode(flags) !== "persistent_db_adapter") {
    return {
      ok: false,
      status: 503,
      code: "self_serve_persistent_adapter_not_selected",
      errors: ["Persistent self-serve adapter acik degil."],
    };
  }

  const normalized = normalizeSelfServeRegistrationInput(input);
  const validationErrors = validateSelfServeRegistrationInput(normalized);

  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      code: "self_serve_registration_rejected",
      errors: validationErrors.map((error) => error.message),
      fieldErrors: validationErrors,
    };
  }

  let adapter = options?.adapter;

  if (!adapter) {
    const factoryResult = createSupabaseSelfServePersistentRegistrationAdapter(flags);

    if (!factoryResult.ok) {
      return {
        ok: false,
        status: 503,
        code: "self_serve_persistent_adapter_unavailable",
        errors: ["Persistent self-serve DB adapter icin owner DB config eksik."],
        missingEnv: factoryResult.missingEnv,
      };
    }

    adapter = factoryResult.adapter;
  }

  try {
    const sameRegistration = await adapter.findByEmailAndSlug(normalized.email, normalized.storeSlug);

    if (sameRegistration) {
      return {
        ok: true,
        request: sameRegistration,
        persistenceMode: "persistent_db_adapter",
        freeStarterStoreEnabled: flags.freeStarterStoreEnabled,
        autoProvisioningEnabled: flags.autoProvisioningEnabled,
        storeCreateEnabled: flags.storeCreateEnabled,
        provisioningEnabled: flags.provisioningEnabled,
        idempotent: true,
        creation: buildPersistentCreationState({
          idempotent: true,
          provisioningJob: buildPersistentJobArtifact(sameRegistration.id),
        }),
      };
    }

    const sameSlug = await adapter.findBySlug(normalized.storeSlug);

    if (sameSlug) {
      return {
        ok: false,
        status: 409,
        code: "self_serve_slug_taken",
        errors: ["Bu magaza adresi icin bekleyen bir kayit var."],
      };
    }

    const emailRegistrationCount = await adapter.countByEmail(normalized.email);

    if (emailRegistrationCount >= flags.maxStoresPerUser) {
      return {
        ok: false,
        status: 409,
        code: "self_serve_email_has_existing_store",
        errors: ["Bu e-posta icin zaten bir magaza kaydi isleniyor."],
      };
    }

    const request = buildSelfServeRegistrationRecord(createRequestId(), normalized, {
      defaultDomainSuffix: flags.defaultDomainSuffix,
      autoProvisioningEnabled: flags.autoProvisioningEnabled,
      requirePaymentBeforePublic: flags.requirePaymentBeforePublic,
      requireEmailVerification: flags.requireEmailVerification,
    });
    const created = await adapter.createRegistrationBundle({
      request,
      normalized,
      idempotencyKey: createIdempotencyKey(normalized.email, normalized.storeSlug),
    });

    return {
      ok: true,
      request: created.request,
      persistenceMode: "persistent_db_adapter",
      freeStarterStoreEnabled: flags.freeStarterStoreEnabled,
      autoProvisioningEnabled: flags.autoProvisioningEnabled,
      storeCreateEnabled: flags.storeCreateEnabled,
      provisioningEnabled: flags.provisioningEnabled,
      idempotent: false,
      creation: buildPersistentCreationState({
        idempotent: false,
        provisioningJob: created.provisioningJob,
      }),
    };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "self_serve_persistent_adapter_write_failed",
      errors: ["Persistent self-serve kaydi guvenli sekilde tamamlanamadi."],
    };
  }
}
