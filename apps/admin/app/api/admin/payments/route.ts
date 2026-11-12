import { NextRequest, NextResponse } from "next/server";
import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";
import { redactSecretFields, restoreSecretFields } from "@/lib/legacy-settings-secrets";
import { createServerClient } from "@/lib/supabase";
import { getStoredPaymentGateways } from "@/lib/db/payment-gateways";
import { getPaymentProviderDefinition, normalizePaymentGateways } from "@/lib/payment-providers";
import type { PaymentGatewayConfig } from "@/types/payment";

const SETTING_KEY = "payment_gateways";

function secretKeys(fields: { key: string; secret?: boolean }[]) {
  return fields.filter((field) => field.secret).map((field) => field.key);
}

function redactPaymentGateway(gateway: PaymentGatewayConfig) {
  const definition = getPaymentProviderDefinition(gateway.gateway);
  return {
    ...gateway,
    credentials: redactSecretFields(gateway.credentials, secretKeys(definition.credentialFields)),
    configuration: redactSecretFields(gateway.configuration, secretKeys(definition.configurationFields)),
  };
}

function restorePaymentGatewayCredentials(gateway: PaymentGatewayConfig, current: PaymentGatewayConfig[]) {
  const stored = current.find(({ id, gateway: provider }) => id === gateway.id && provider === gateway.gateway);
  const definition = getPaymentProviderDefinition(gateway.gateway);
  return {
    ...gateway,
    credentials: restoreSecretFields(gateway.credentials, stored?.credentials, secretKeys(definition.credentialFields)),
    configuration: restoreSecretFields(gateway.configuration, stored?.configuration, secretKeys(definition.configurationFields)),
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireLegacyAdminApi(request, "settings");
  if (denied) return denied;

  try {
    const gateways = await getStoredPaymentGateways();
    return NextResponse.json({
      success: true,
      gateways: gateways.map(redactPaymentGateway),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ success: false, error: "Ödeme ayarları alınamadı." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireLegacyAdminApi(request, "settings");
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.gateways)) {
      return NextResponse.json({ success: false, error: "Geçersiz ödeme ayarı." }, { status: 400 });
    }

    const settings = createServerClient().from("settings");
    const { data, error: readError } = await settings.select("value, updated_at").eq("key", SETTING_KEY).maybeSingle();
    if (readError) throw readError;

    const current = normalizePaymentGateways(data?.value);
    const gateways = normalizePaymentGateways(body.gateways)
      .map((gateway) => restorePaymentGatewayCredentials(gateway, current));
    const update = { key: SETTING_KEY, value: gateways, updated_at: new Date().toISOString() };
    const query = settings.update(update).eq("key", SETTING_KEY);
    const result = data
      ? await (data.updated_at ? query.eq("updated_at", data.updated_at) : query.is("updated_at", null))
        .select("key").maybeSingle()
      : await settings.insert(update).select("key").single();

    if (result.error && result.error.code !== "23505") throw result.error;
    if (!result.data) {
      return NextResponse.json(
        { success: false, error: "Ödeme ayarları değişti. Sayfayı yenileyip tekrar deneyin." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Ödeme ayarları kaydedildi.", gateways: gateways.map(redactPaymentGateway) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: "Ödeme ayarları kaydedilemedi." }, { status: 500 });
  }
}
