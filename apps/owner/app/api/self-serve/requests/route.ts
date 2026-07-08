import { NextResponse } from "next/server";

function legacyEndpointDisabledResponse() {
  return NextResponse.json(
    {
      code: "self_serve_legacy_request_endpoint_disabled",
      message: "Self-serve mağaza kurulumu için /api/self-serve/register endpointini kullanın.",
      replacement: "/api/self-serve/register",
    },
    { status: 410 },
  );
}

export async function GET() {
  return legacyEndpointDisabledResponse();
}

export async function POST() {
  return legacyEndpointDisabledResponse();
}
