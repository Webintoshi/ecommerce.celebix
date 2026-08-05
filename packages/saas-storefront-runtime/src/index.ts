export { StorefrontResolutionError } from "./errors.ts";
export type { StorefrontResolutionErrorCode } from "./errors.ts";

export { normalizeStoreHostname } from "./host.ts";
export type { ParsedTrustedHost, TrustedHostPolicy } from "./host.ts";

export { InMemoryStoreDomainResolver } from "./resolver.ts";
export type {
  InMemoryStoreDomainRecord,
  StoreDomainResolution,
  StoreDomainResolver,
} from "./resolver.ts";

export { buildCanonicalStorefrontUrl } from "./canonical-url.ts";

export { resolveStorefrontRequestContext } from "./context.ts";
export type {
  ResolveStorefrontRequestContextInput,
  StorefrontRequestContext,
  StorefrontStoreRecord,
} from "./context.ts";

export {
  assertStoreNamespace,
  buildStoreCacheKey,
  buildStoreCacheTag,
  buildStoreJobKey,
  buildStoreObjectKey,
} from "./namespace.ts";
