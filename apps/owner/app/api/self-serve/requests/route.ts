import { NextResponse, type NextRequest } from "next/server";
import { validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { createSelfServeOnboardingRequest, getSelfServeRequestAdapterMode } from "@/lib/self-serve-request-store";
import type { SelfServeOnboardingInput } from "@/lib/self-serve-onboarding";

function getSameOriginErrorMessage(reason: ReturnType<typeof validateSameOriginRequest>["reason"]) {
  if (reason === "missing-origin") {
    return "Guvenli basvuru icin origin basligi gerekli.";
  }

  return "Bu basvuru farkli bir origin uzerinden gonderilemez.";
}

export async function GET() {
  return NextResponse.json(
    {
      code: "self_serve_public_read_disabled",
      message: "Self-serve basvurulari public endpoint uzerinden listelenmez.",
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

  let body: SelfServeOnboardingInput;

  try {
    body = (await request.json()) as SelfServeOnboardingInput;
  } catch {
    return NextResponse.json(
      { code: "self_serve_invalid_payload", message: "Basvuru verisi okunamadi." },
      { status: 400 },
    );
  }

  const result = createSelfServeOnboardingRequest(body);

  if (!result.ok) {
    return NextResponse.json(
      {
        code: "self_serve_request_rejected",
        errors: result.errors,
        persistenceMode: getSelfServeRequestAdapterMode(),
      },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      request: result.request,
      persistenceMode: result.persistenceMode,
      provisioning: "disabled_in_phase_1",
      storeCreate: "disabled_in_phase_1",
    },
    { status: 201 },
  );
}
