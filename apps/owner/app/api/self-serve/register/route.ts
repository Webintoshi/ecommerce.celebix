import { NextResponse, type NextRequest } from "next/server";
import { validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { createSelfServeDirectRegistration, getSelfServeRequestAdapterMode } from "@/lib/self-serve-request-store";
import {
  buildSelfServeAdminUrl,
  buildSelfServeStorefrontUrl,
  type SelfServeRegistrationInput,
} from "@/lib/self-serve-registration";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 6;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __celebixSelfServeRegistrationRateLimit: Map<string, RateLimitBucket> | undefined;
}

function getRateLimitStore() {
  if (!globalThis.__celebixSelfServeRegistrationRateLimit) {
    globalThis.__celebixSelfServeRegistrationRateLimit = new Map();
  }

  return globalThis.__celebixSelfServeRegistrationRateLimit;
}

function getClientKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}

function checkRateLimit(request: NextRequest) {
  const key = getClientKey(request);
  const now = Date.now();
  const store = getRateLimitStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const };
  }

  if (current.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { allowed: true as const };
}

function getSameOriginErrorMessage(reason: ReturnType<typeof validateSameOriginRequest>["reason"]) {
  if (reason === "missing-origin") {
    return "Guvenli kayit icin origin basligi gerekli.";
  }

  return "Bu kayit farkli bir origin uzerinden gonderilemez.";
}

export async function GET() {
  return NextResponse.json(
    {
      code: "self_serve_register_read_disabled",
      message: "Self-serve direkt kayit endpointi yalnizca POST kabul eder.",
    },
    { status: 405 },
  );
}

export async function POST(request: NextRequest) {
  const originCheck = validateSameOriginRequest(request);

  if (!originCheck.allowed) {
    return NextResponse.json(
      {
        code: "self_serve_origin_required",
        message: getSameOriginErrorMessage(originCheck.reason),
      },
      { status: 403 },
    );
  }

  const rateLimit = checkRateLimit(request);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        code: "self_serve_register_rate_limited",
        message: "Cok fazla kayit denemesi yapildi. Lutfen kisa bir sure sonra tekrar deneyin.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  let body: SelfServeRegistrationInput;

  try {
    body = (await request.json()) as SelfServeRegistrationInput;
  } catch {
    return NextResponse.json(
      { code: "self_serve_invalid_payload", message: "Kayit verisi okunamadi." },
      { status: 400 },
    );
  }

  const result = createSelfServeDirectRegistration(body);

  if (!result.ok) {
    return NextResponse.json(
      {
        code: result.code,
        errors: result.errors,
        fieldErrors: "fieldErrors" in result ? result.fieldErrors : undefined,
        persistenceMode: getSelfServeRequestAdapterMode(),
      },
      { status: result.status },
    );
  }

  const flags = getSelfServeFeatureFlags();
  const plannedStoreUrl =
    result.request.store.plannedStoreUrl ?? buildSelfServeStorefrontUrl(result.request.store.slug, flags.defaultDomainSuffix);
  const plannedAdminUrl =
    result.request.store.plannedAdminUrl ?? buildSelfServeAdminUrl(result.request.store.slug, flags.defaultDomainSuffix);

  return NextResponse.json(
    {
      code: "self_serve_registration_pending",
      status: "pending",
      request: result.request,
      adminRedirectUrl: null,
      plannedStoreUrl,
      plannedAdminUrl,
      plan: "free",
      domain: {
        mode: "subdomain",
        storefront: plannedStoreUrl,
        admin: plannedAdminUrl,
        customDomainAtRegistration: false,
        customDomainLaterPath: "/admin/ayarlar/domainler",
      },
      persistenceMode: result.persistenceMode,
      auth: {
        provider: "logto",
        mode: "prepared_contract_only",
        emailVerificationRequired: flags.requireEmailVerification,
      },
      handoff: {
        mode: "pending_secure_one_time_handoff",
        tokensInQueryString: false,
      },
      provisioning: {
        freeStarterStoreEnabled: result.freeStarterStoreEnabled,
        autoProvisioningEnabled: result.autoProvisioningEnabled,
        storeCreateEnabled: result.storeCreateEnabled,
        provisioningEnabled: result.provisioningEnabled,
        state:
          result.autoProvisioningEnabled && result.storeCreateEnabled && result.provisioningEnabled
            ? "not_implemented_safe_stop"
            : "disabled_by_flag",
      },
    },
    { status: 202 },
  );
}
