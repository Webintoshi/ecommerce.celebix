import "server-only";

import { getSelfServeFeatureFlags, getSelfServePersistenceMode } from "@/lib/self-serve-flags";
import {
  buildSelfServeOnboardingRequest,
  normalizeSelfServeOnboardingInput,
  type SelfServeOnboardingInput,
  type SelfServeOnboardingRequest,
  validateSelfServeOnboardingInput,
} from "@/lib/self-serve-onboarding";

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
