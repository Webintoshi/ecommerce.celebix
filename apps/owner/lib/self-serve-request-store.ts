import "server-only";

import {
  getSelfServeFeatureFlags,
  getSelfServePersistenceMode,
  isSelfServeLocalMockCreationEnabled,
  type SelfServePersistenceMode,
} from "@/lib/self-serve-flags";
import type { SelfServeOnboardingRequest } from "@/lib/self-serve-onboarding";
import {
  buildSelfServeRegistrationRecord,
  normalizeSelfServeRegistrationInput,
  type SelfServeCreationState,
  type SelfServeLocalMockCreationArtifacts,
  type SelfServeRegistrationRecord,
  type SelfServeRegistrationInput,
  validateSelfServeRegistrationInput,
} from "@/lib/self-serve-registration";

const MAX_VOLATILE_REQUESTS = 100;

type SelfServeGlobalStore = {
  requests: SelfServeRegistrationRecord[];
  mockStores: SelfServeLocalMockCreationArtifacts["store"][];
  mockDomains: Array<SelfServeLocalMockCreationArtifacts["domain"] | SelfServeLocalMockCreationArtifacts["adminDomain"]>;
  mockMemberships: SelfServeLocalMockCreationArtifacts["membership"][];
  mockProvisioningJobs: SelfServeLocalMockCreationArtifacts["provisioningJob"][];
};

declare global {
  // eslint-disable-next-line no-var
  var __celebixSelfServeOnboardingStore: SelfServeGlobalStore | undefined;
}

function getVolatileStore(): SelfServeGlobalStore {
  if (!globalThis.__celebixSelfServeOnboardingStore) {
    globalThis.__celebixSelfServeOnboardingStore = {
      requests: [],
      mockStores: [],
      mockDomains: [],
      mockMemberships: [],
      mockProvisioningJobs: [],
    };
  }

  return globalThis.__celebixSelfServeOnboardingStore;
}

function createRequestId() {
  return `ssr_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function getSelfServeRequestAdapterMode() {
  return getSelfServePersistenceMode();
}

export function listSelfServeOnboardingRequests(): SelfServeOnboardingRequest[] {
  return [...getVolatileStore().requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getSelfServeOnboardingRequest(id: string): SelfServeOnboardingRequest | null {
  return getVolatileStore().requests.find((request) => request.id === id) ?? null;
}

function buildLocalMockCreationArtifacts(request: SelfServeRegistrationRecord): SelfServeLocalMockCreationArtifacts {
  const slug = request.store.slug;
  const plannedStoreUrl = request.store.plannedStoreUrl ?? `https://${request.store.proposedDomain}`;
  const plannedAdminUrl = request.store.plannedAdminUrl ?? `https://admin-${slug}.celebix.site`;

  return {
    store: {
      id: `mock_store_${slug}`,
      slug,
      name: request.store.storeName,
      url: plannedStoreUrl,
      adminUrl: plannedAdminUrl,
      status: "mock_created",
    },
    package: {
      id: `mock_pkg_${slug}`,
      plan: "free_starter",
      status: "mock_active",
    },
    domain: {
      id: `mock_domain_storefront_${slug}`,
      hostname: request.store.proposedDomain,
      type: "platform_subdomain",
      isPrimary: true,
    },
    adminDomain: {
      id: `mock_domain_admin_${slug}`,
      hostname: `admin-${request.store.proposedDomain}`,
      type: "admin_subdomain",
      isPrimary: true,
    },
    membership: {
      id: `mock_member_${slug}`,
      role: "store_owner",
      principalEmail: request.applicant.email,
      status: "mock_active",
    },
    provisioningJob: {
      id: `mock_job_${slug}`,
      adapter: "local_mock",
      status: "queued_mock",
      kind: "free_starter_store_creation",
    },
  };
}

function persistLocalMockArtifacts(store: SelfServeGlobalStore, artifacts: SelfServeLocalMockCreationArtifacts) {
  store.mockStores = [artifacts.store, ...store.mockStores.filter((item) => item.slug !== artifacts.store.slug)];
  store.mockDomains = [
    artifacts.domain,
    artifacts.adminDomain,
    ...store.mockDomains.filter(
      (item) => item.hostname !== artifacts.domain.hostname && item.hostname !== artifacts.adminDomain.hostname,
    ),
  ];
  store.mockMemberships = [
    artifacts.membership,
    ...store.mockMemberships.filter((item) => item.id !== artifacts.membership.id),
  ];
  store.mockProvisioningJobs = [
    artifacts.provisioningJob,
    ...store.mockProvisioningJobs.filter((item) => item.id !== artifacts.provisioningJob.id),
  ];
}

function buildCreationState(input: {
  request: SelfServeRegistrationRecord;
  store: SelfServeGlobalStore;
  localMockCreationEnabled: boolean;
  idempotent: boolean;
}): SelfServeCreationState {
  if (!input.localMockCreationEnabled) {
    return {
      mode: "production_safe_pending",
      status: "processing",
      idempotent: input.idempotent,
    };
  }

  const artifacts = buildLocalMockCreationArtifacts(input.request);
  persistLocalMockArtifacts(input.store, artifacts);

  return {
    mode: "local_mock_creation",
    status: "mock_records_created",
    idempotent: input.idempotent,
    artifacts,
  };
}

type SelfServeDirectRegistrationSuccess = {
  ok: true;
  request: SelfServeRegistrationRecord;
  persistenceMode: SelfServePersistenceMode;
  freeStarterStoreEnabled: boolean;
  autoProvisioningEnabled: boolean;
  storeCreateEnabled: boolean;
  provisioningEnabled: boolean;
  idempotent: boolean;
  creation: SelfServeCreationState;
};

type SelfServeDirectRegistrationFailure = {
  ok: false;
  status: number;
  code: string;
  errors: string[];
  fieldErrors?: ReturnType<typeof validateSelfServeRegistrationInput>;
};

export function createSelfServeDirectRegistration(input: SelfServeRegistrationInput) {
  const flags = getSelfServeFeatureFlags();

  if (!flags.signupEnabled || !flags.directRegistrationEnabled) {
    return {
      ok: false as const,
      status: 503,
      code: "self_serve_direct_registration_disabled",
      errors: ["Self-serve direkt kayit akisi su anda kapali."],
    };
  }

  const normalized = normalizeSelfServeRegistrationInput(input);
  const validationErrors = validateSelfServeRegistrationInput(normalized);

  if (validationErrors.length > 0) {
    return {
      ok: false as const,
      status: 400,
      code: "self_serve_registration_rejected",
      errors: validationErrors.map((error) => error.message),
      fieldErrors: validationErrors,
    };
  }

  const store = getVolatileStore();
  const existingSameRegistration = store.requests.find(
    (request) => request.store.slug === normalized.storeSlug && request.applicant.email === normalized.email,
  );

  if (existingSameRegistration) {
    const localMockCreationEnabled = isSelfServeLocalMockCreationEnabled(flags);
    const creation = buildCreationState({
      request: existingSameRegistration,
      store,
      localMockCreationEnabled,
      idempotent: true,
    });

    return {
      ok: true as const,
      request: existingSameRegistration,
      persistenceMode: getSelfServePersistenceMode(flags),
      freeStarterStoreEnabled: flags.freeStarterStoreEnabled,
      autoProvisioningEnabled: flags.autoProvisioningEnabled,
      storeCreateEnabled: flags.storeCreateEnabled,
      provisioningEnabled: flags.provisioningEnabled,
      idempotent: true,
      creation,
    } satisfies SelfServeDirectRegistrationSuccess;
  }

  const duplicateSlug = store.requests.some((request) => request.store.slug === normalized.storeSlug);
  const existingEmailRegistrations = store.requests.filter((request) => request.applicant.email === normalized.email);
  const emailStoreLimitReached = existingEmailRegistrations.length >= flags.maxStoresPerUser;

  if (duplicateSlug || emailStoreLimitReached) {
    return {
      ok: false as const,
      status: 409,
      code: duplicateSlug ? "self_serve_slug_taken" : "self_serve_email_has_existing_store",
      errors: [
        duplicateSlug
          ? "Bu magaza adresi icin bekleyen bir kayit var."
          : "Bu e-posta icin zaten bir magaza kaydi isleniyor.",
      ],
    } satisfies SelfServeDirectRegistrationFailure;
  }

  const request = buildSelfServeRegistrationRecord(createRequestId(), normalized, {
    defaultDomainSuffix: flags.defaultDomainSuffix,
    autoProvisioningEnabled: flags.autoProvisioningEnabled,
    requirePaymentBeforePublic: flags.requirePaymentBeforePublic,
    requireEmailVerification: flags.requireEmailVerification,
  });

  store.requests = [request, ...store.requests].slice(0, MAX_VOLATILE_REQUESTS);
  const localMockCreationEnabled = isSelfServeLocalMockCreationEnabled(flags);
  const creation = buildCreationState({
    request,
    store,
    localMockCreationEnabled,
    idempotent: false,
  });

  return {
    ok: true as const,
    request,
    persistenceMode: getSelfServePersistenceMode(flags),
    freeStarterStoreEnabled: flags.freeStarterStoreEnabled,
    autoProvisioningEnabled: flags.autoProvisioningEnabled,
    storeCreateEnabled: flags.storeCreateEnabled,
    provisioningEnabled: flags.provisioningEnabled,
    idempotent: false,
    creation,
  } satisfies SelfServeDirectRegistrationSuccess;
}
