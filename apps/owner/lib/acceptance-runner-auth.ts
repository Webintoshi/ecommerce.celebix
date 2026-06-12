import "server-only";

import crypto from "node:crypto";
import type { OwnerAuthContext } from "@/lib/owner-auth";
import { predictStoreSlug } from "@/lib/owner-store-create-service";

const DEFAULT_ALLOWED_SLUG_PREFIXES = ["atlas-product-ready-", "atlas-final-acceptance-"] as const;
const ACCEPTANCE_RUNNER_EMAIL = "owner-acceptance-runner@internal.celebix";
const ACCEPTANCE_RUNNER_ID = "00000000-0000-0000-0000-000000000000";
const FORBIDDEN_SLUG_PATTERNS = [
  /^admin$/,
  /^api$/,
  /^celebix$/,
  /^derycraft/,
  /derycraft/,
  /^ecommerce$/,
  /^owner$/,
  /^prod(?:uction)?$/,
  /^storefront$/,
  /^www$/,
  /(?:^|-)derycraft(?:-|$)/,
  /(?:^|-)customer(?:-|$)/,
  /(?:^|-)production(?:-|$)/,
];

export interface AcceptanceRunnerAuthSuccess {
  ok: true;
}

export interface AcceptanceRunnerAuthFailure {
  ok: false;
  status: 401;
  code: "missing_token" | "invalid_token" | "gate_not_configured";
  message: string;
}

export interface AcceptanceSlugPolicySuccess {
  ok: true;
  slug: string;
  allowedPrefix: string;
}

export interface AcceptanceSlugPolicyFailure {
  ok: false;
  slug: string;
  allowedPrefix: string;
  reason: "missing_slug" | "prefix_forbidden" | "reserved_slug" | "slug_too_long";
  message: string;
}

export function getAcceptanceAllowedSlugPrefixes(): string[] {
  const configuredPrefixes = process.env.OWNER_ACCEPTANCE_ALLOWED_SLUG_PREFIX?.trim();
  const prefixes = configuredPrefixes
    ? configuredPrefixes.split(/[,\s]+/).map((prefix) => prefix.trim()).filter(Boolean)
    : [...DEFAULT_ALLOWED_SLUG_PREFIXES];

  return [...new Set(prefixes)].length > 0 ? [...new Set(prefixes)] : [...DEFAULT_ALLOWED_SLUG_PREFIXES];
}

export function getAcceptanceAllowedSlugPrefix(): string {
  return getAcceptanceAllowedSlugPrefixes()[0] ?? DEFAULT_ALLOWED_SLUG_PREFIXES[0];
}

function formatAllowedPrefixes(prefixes: string[]): string {
  return prefixes.join(", ");
}

function getAcceptanceRunnerToken(): string | null {
  return process.env.OWNER_ACCEPTANCE_RUNNER_TOKEN?.trim() || null;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() || "";
  const [scheme, ...rest] = header.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || rest.length === 0) {
    return null;
  }

  const token = rest.join(" ").trim();
  return token || null;
}

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function safeEquals(left: string, right: string): boolean {
  return crypto.timingSafeEqual(digest(left), digest(right));
}

export function authorizeAcceptanceRunner(request: Request): AcceptanceRunnerAuthSuccess | AcceptanceRunnerAuthFailure {
  const expectedToken = getAcceptanceRunnerToken();

  if (!expectedToken) {
    return {
      ok: false,
      status: 401,
      code: "gate_not_configured",
      message: "Acceptance runner token configured degil.",
    };
  }

  const suppliedToken = readBearerToken(request);

  if (!suppliedToken) {
    return {
      ok: false,
      status: 401,
      code: "missing_token",
      message: "Bearer token gerekli.",
    };
  }

  if (!safeEquals(suppliedToken, expectedToken)) {
    return {
      ok: false,
      status: 401,
      code: "invalid_token",
      message: "Bearer token gecersiz.",
    };
  }

  return { ok: true };
}

export function validateAcceptanceRunnerSlug(rawSlug: unknown): AcceptanceSlugPolicySuccess | AcceptanceSlugPolicyFailure {
  const allowedPrefixes = getAcceptanceAllowedSlugPrefixes();
  const allowedPrefix = formatAllowedPrefixes(allowedPrefixes);
  const slug = typeof rawSlug === "string" ? predictStoreSlug(rawSlug, rawSlug) : "";

  if (!slug) {
    return {
      ok: false,
      slug,
      allowedPrefix,
      reason: "missing_slug",
      message: "Slug gerekli.",
    };
  }

  if (slug.length > 80) {
    return {
      ok: false,
      slug,
      allowedPrefix,
      reason: "slug_too_long",
      message: "Slug kabul edilen uzunlugu asiyor.",
    };
  }

  const matchedAllowedPrefix = allowedPrefixes.find((prefix) => slug.startsWith(prefix));

  if (!matchedAllowedPrefix) {
    return {
      ok: false,
      slug,
      allowedPrefix,
      reason: "prefix_forbidden",
      message: `Acceptance runner sadece ${allowedPrefix} prefixleri ile calisir.`,
    };
  }

  if (FORBIDDEN_SLUG_PATTERNS.some((pattern) => pattern.test(slug))) {
    return {
      ok: false,
      slug,
      allowedPrefix,
      reason: "reserved_slug",
      message: "Production/customer slug acceptance runner ile kullanilamaz.",
    };
  }

  return {
    ok: true,
    slug,
    allowedPrefix: matchedAllowedPrefix,
  };
}

export function getAcceptanceRunnerAuthContext(): OwnerAuthContext {
  return {
    user: {
      id: ACCEPTANCE_RUNNER_ID,
      email: ACCEPTANCE_RUNNER_EMAIL,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "1970-01-01T00:00:00.000Z",
    } as OwnerAuthContext["user"],
    profile: {
      id: ACCEPTANCE_RUNNER_ID,
      email: ACCEPTANCE_RUNNER_EMAIL,
      full_name: "Owner Acceptance Runner",
      role: "super_admin",
      is_active: true,
    },
  };
}
