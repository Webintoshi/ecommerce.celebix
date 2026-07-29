import {
  StorefrontResolutionError,
  buildCanonicalStorefrontUrl,
  resolveStorefrontRequestContext,
  type StoreDomainResolver,
  type StorefrontRequestContext,
  type StorefrontStoreRecord,
} from "@celebix/saas-storefront-runtime";

import {
  selectTrustedStorefrontHostAuthority,
  type TrustedStorefrontHostAuthority,
} from "./trusted-host-authority.ts";

export interface HeaderReader {
  get(name: string): string | null;
}

export interface StorefrontAppDependencies {
  trustedHostAuthority?: (headers: HeaderReader) => TrustedStorefrontHostAuthority;
  resolver: StoreDomainResolver;
  loadStorefrontStore: (
    ...parameters: Parameters<Parameters<typeof resolveStorefrontRequestContext>[0]["loadStorefrontStore"]>
  ) => StorefrontStoreRecord | null | Promise<StorefrontStoreRecord | null>;
  allowLocalTestHosts?: boolean;
}

export interface StorefrontRequestInput {
  headers: HeaderReader;
  pathname: string;
  requestId: string;
}

export type StorefrontShellKind =
  | "host_not_configured"
  | "invalid_host"
  | "unknown_host"
  | "inactive_host"
  | "ambiguous_host"
  | "canonical_redirect"
  | "active_placeholder";

export interface StorefrontShellResult {
  kind: StorefrontShellKind;
  status: number;
  title: string;
  message: string;
  context?: StorefrontRequestContext;
  location?: string;
}

const HOST_NOT_CONFIGURED: StorefrontShellResult = {
  kind: "host_not_configured",
  status: 503,
  title: "Storefront unavailable",
  message: "This shared storefront runtime is not configured.",
};

function errorShell(error: StorefrontResolutionError): StorefrontShellResult {
  switch (error.code) {
    case "host_not_found":
      return {
        kind: "unknown_host",
        status: 404,
        title: "Storefront not found",
        message: "No storefront is configured for this hostname.",
      };
    case "host_unverified":
    case "store_inactive":
    case "host_store_mismatch":
      return {
        kind: "inactive_host",
        status: 503,
        title: "Storefront unavailable",
        message: "This storefront hostname is not active.",
      };
    case "ambiguous_host":
      return {
        kind: "ambiguous_host",
        status: 503,
        title: "Storefront unavailable",
        message: "This hostname cannot be resolved safely.",
      };
    case "invalid_input":
      return {
        kind: "invalid_host",
        status: 400,
        title: "Invalid storefront host",
        message: "The request hostname is invalid.",
      };
  }
}

export function createStorefrontRequestHandler(dependencies?: StorefrontAppDependencies) {
  return async function handleStorefrontRequest(input: StorefrontRequestInput): Promise<StorefrontShellResult> {
    if (!dependencies) {
      return { ...HOST_NOT_CONFIGURED };
    }

    const authority = (
      dependencies.trustedHostAuthority ?? selectTrustedStorefrontHostAuthority
    )(input.headers);
    if (authority.kind !== "trusted") {
      return { ...HOST_NOT_CONFIGURED };
    }

    let context: Awaited<ReturnType<typeof resolveStorefrontRequestContext>>;
    try {
      context = await resolveStorefrontRequestContext({
        requestId: input.requestId,
        trustedHost: authority.hostname,
        resolver: dependencies.resolver,
        loadStorefrontStore: dependencies.loadStorefrontStore,
        hostPolicy: dependencies.allowLocalTestHosts ? { allowLocalTestHosts: true } : undefined,
      });
    } catch {
      return { ...HOST_NOT_CONFIGURED };
    }

    if (context instanceof StorefrontResolutionError) {
      return errorShell(context);
    }

    if (context.resolvedHost.hostname !== context.resolvedHost.canonicalHostname) {
      let location: string;
      try {
        location = buildCanonicalStorefrontUrl(
          context.resolvedHost,
          input.pathname,
          dependencies.allowLocalTestHosts ? { allowLocalTestHosts: true } : undefined,
        );
      } catch {
        return errorShell(new StorefrontResolutionError("invalid_input"));
      }

      return {
        kind: "canonical_redirect",
        status: 308,
        title: "Redirecting",
        message: "Redirecting to the canonical storefront hostname.",
        location,
      };
    }

    return {
      kind: "active_placeholder",
      status: 200,
      title: "Storefront ready",
      message: "This storefront is active. Commerce data is not connected in Phase 1.",
      context,
    };
  };
}

export function createHealthPayload() {
  return {
    status: "ok" as const,
    service: "storefront-shared" as const,
  };
}
