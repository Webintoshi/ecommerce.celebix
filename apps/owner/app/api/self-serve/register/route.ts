function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return { allowed: false as const, message: "Güvenli kayıt için origin başlığı gerekli." };
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return { allowed: false as const, message: "Bu kayıt farklı bir origin üzerinden gönderilemez." };
    }
  } catch {
    return { allowed: false as const, message: "Bu kayıt farklı bir origin üzerinden gönderilemez." };
  }
  return { allowed: true as const };
}

export async function GET() {
  return json(
    { code: "self_serve_register_read_disabled", message: "Kayıt endpointi yalnızca POST kabul eder." },
    405,
  );
}

export async function POST(request: Request) {
  const originCheck = validateOrigin(request);
  if (!originCheck.allowed) {
    return json({ code: "self_serve_origin_required", message: originCheck.message }, 403);
  }

  // Do not read the body while disabled: passwords remain the future identity
  // provider's concern and never enter local persistence or Tenant Core.
  return json(
    {
      code: "self_serve_saas_registration_disabled",
      state: "disabled",
      message: "Güvenli mağaza kayıt altyapısı henüz etkin değil.",
    },
    503,
  );
}
