import "server-only";

import { getSelfServeFeatureFlags, getSelfServePersistenceMode } from "@/lib/self-serve-flags";
import {
  buildSelfServeOnboardingRequest,
  normalizeSelfServeOnboardingInput,
  type SelfServeOnboardingInput,
  type SelfServeOnboardingRequest,
  validateSelfServeOnboardingInput,
} from "@/lib/self-serve-onboarding";
import {
  buildSelfServeRegistrationRecord,
  normalizeSelfServeRegistrationInput,
  type SelfServeRegistrationInput,
  validateSelfServeRegistrationInput,
} from "@/lib/self-serve-registration";

const MAX_VOLATILE_REQUESTS = 100;

type SelfServeGlobalStore = {
  requests: SelfServeOnboardingRequest[];
};

declare global {
  // eslint-disable-next-line no-var
  var __celebixSelfServeOnboardingStore: SelfServeGlobalStore | undefined;
}

function getVolatileStore(): SelfServeGlobalStore {
  if (!globalThis.__celebixSelfServeOnboardingStore) {
    globalThis.__celebixSelfServeOnboardingStore = { requests: [] };
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

export function createSelfServeOnboardingRequest(input: SelfServeOnboardingInput) {
  const flags = getSelfServeFeatureFlags();

  if (!flags.signupEnabled) {
    return {
      ok: false as const,
      status: 503,
      errors: ["Self-serve basvuru akisi su anda kapali."],
    };
  }

  const normalized = normalizeSelfServeOnboardingInput(input);
  const errors = validateSelfServeOnboardingInput(normalized);

  if (errors.length > 0) {
    return {
      ok: false as const,
      status: 400,
      errors,
    };
  }

  const request = buildSelfServeOnboardingRequest(createRequestId(), normalized, flags);
  const store = getVolatileStore();

  store.requests = [request, ...store.requests].slice(0, MAX_VOLATILE_REQUESTS);

  return {
    ok: true as const,
    request,
    persistenceMode: getSelfServePersistenceMode(flags),
  };
}

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
  const duplicateSlug = store.requests.some((request) => request.store.slug === normalized.storeSlug);
  const duplicateEmail = store.requests.some((request) => request.applicant.email === normalized.email);

  if (duplicateSlug || duplicateEmail) {
    return {
      ok: false as const,
      status: 409,
      code: duplicateSlug ? "self_serve_slug_taken" : "self_serve_email_taken",
      errors: [
        duplicateSlug
          ? "Bu magaza adresi icin bekleyen bir kayit var."
          : "Bu e-posta icin bekleyen bir kayit var.",
      ],
    };
  }

  const request = buildSelfServeRegistrationRecord(createRequestId(), normalized, {
    defaultDomainSuffix: flags.defaultDomainSuffix,
    autoProvisioningEnabled: flags.autoProvisioningEnabled,
    requirePaymentBeforePublic: flags.requirePaymentBeforePublic,
    requireEmailVerification: flags.requireEmailVerification,
  });

  store.requests = [request, ...store.requests].slice(0, MAX_VOLATILE_REQUESTS);

  return {
    ok: true as const,
    request,
    persistenceMode: getSelfServePersistenceMode(flags),
    autoProvisioningEnabled: flags.autoProvisioningEnabled,
    storeCreateEnabled: flags.storeCreateEnabled,
    provisioningEnabled: flags.provisioningEnabled,
  };
}
