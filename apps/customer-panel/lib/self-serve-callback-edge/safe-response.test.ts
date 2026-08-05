import assert from "node:assert/strict";
import test from "node:test";

import { projectSafeCallbackResponse } from "./safe-response.ts";

const messages = Object.freeze({
  self_serve_callback_method_not_allowed: "Kimlik doğrulama dönüşü yalnızca GET kabul eder.",
  self_serve_callback_untrusted: "Kimlik doğrulama dönüşü doğrulanamadı.",
  self_serve_callback_forbidden: "Kimlik doğrulama dönüşüne izin verilmedi.",
  self_serve_callback_rate_limited: "Kimlik doğrulama dönüşü şu anda sınırlandırıldı.",
  self_serve_callback_gate_unavailable: "Kimlik doğrulama güvenlik kontrolü şu anda kullanılamıyor.",
  self_serve_callback_invalid: "Kimlik doğrulama dönüşü geçerli değil.",
  self_serve_callback_query_too_large: "Kimlik doğrulama dönüşü izin verilen boyutu aşıyor.",
  self_serve_oidc_provider_rejected: "Kimlik sağlayıcı kayıt isteğini reddetti.",
  self_serve_oidc_provider_unavailable: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
  self_serve_callback_restart_required: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı.",
  self_serve_callback_recovery_failed: "Kimlik doğrulama dönüşü güvenli şekilde kurtarılamadı.",
  self_serve_oidc_invalid_state: "Kimlik doğrulama durumu geçerli değil.",
  self_serve_oidc_state_expired: "Kimlik doğrulama durumunun süresi doldu.",
  self_serve_oidc_nonce_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_issuer_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_audience_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_invalid_callback: "Kimlik doğrulama dönüşü geçerli değil.",
  self_serve_callback_unavailable: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı.",
  self_serve_completion_pending: "Mağaza hazırlama işlemi sürüyor.",
  self_serve_completion_reconciliation_required: "Mağaza sonucu doğrulama bekliyor.",
  self_serve_completion_state_unknown: "Mağaza hazırlama durumu şu anda doğrulanamıyor.",
  self_serve_completion_rejected: "Mağaza hazırlama işlemi tamamlanamadı.",
});

type ErrorCode = keyof typeof messages;
type ErrorFixture = Readonly<{
  state: string;
  code: ErrorCode;
  statuses: readonly number[];
  retryable: boolean;
  restartRegistration?: true;
}>;

const successStates = [
  "tenant_created_session_pending",
  "tenant_recovered_session_pending",
  "tenant_already_created_session_pending",
] as const;

const errorFixtures: readonly ErrorFixture[] = [
  { state: "rejected", code: "self_serve_callback_method_not_allowed", statuses: [405], retryable: false },
  { state: "rejected", code: "self_serve_callback_untrusted", statuses: [401], retryable: false },
  { state: "rejected", code: "self_serve_callback_forbidden", statuses: [403], retryable: false },
  { state: "rejected", code: "self_serve_callback_rate_limited", statuses: [429], retryable: true },
  { state: "rejected", code: "self_serve_callback_gate_unavailable", statuses: [503], retryable: true },
  { state: "rejected", code: "self_serve_callback_invalid", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_callback_query_too_large", statuses: [413], retryable: false },
  { state: "rejected", code: "self_serve_oidc_provider_rejected", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_oidc_invalid_state", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_oidc_state_expired", statuses: [410], retryable: false },
  { state: "rejected", code: "self_serve_oidc_nonce_mismatch", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_oidc_issuer_mismatch", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_oidc_audience_mismatch", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_oidc_invalid_callback", statuses: [400], retryable: false },
  { state: "rejected", code: "self_serve_callback_unavailable", statuses: [503], retryable: true },
  { state: "failed", code: "self_serve_callback_unavailable", statuses: [503], retryable: false },
  { state: "in_progress", code: "self_serve_completion_pending", statuses: [202], retryable: true },
  { state: "restart_required", code: "self_serve_callback_restart_required", statuses: [409], retryable: false, restartRegistration: true },
  { state: "restart_required", code: "self_serve_oidc_provider_unavailable", statuses: [503], retryable: false, restartRegistration: true },
  { state: "recovery_failed", code: "self_serve_callback_recovery_failed", statuses: [409, 503], retryable: false },
  { state: "commit_unknown", code: "self_serve_completion_reconciliation_required", statuses: [409], retryable: false },
  { state: "reconciliation_required", code: "self_serve_completion_reconciliation_required", statuses: [409], retryable: false },
  { state: "recovery_absent", code: "self_serve_completion_reconciliation_required", statuses: [409], retryable: false },
  { state: "completion_state_unknown", code: "self_serve_completion_state_unknown", statuses: [503], retryable: false },
  { state: "completion_failed", code: "self_serve_completion_rejected", statuses: [409], retryable: false },
  { state: "completion_rejected", code: "self_serve_completion_rejected", statuses: [409], retryable: false },
  { state: "completion_rejected", code: "self_serve_callback_unavailable", statuses: [503], retryable: false },
] as const;

function successBody(state: (typeof successStates)[number] = successStates[0]) {
  return {
    state,
    storeSlug: "ornek-magaza",
    storefrontUrl: "https://ornek-magaza.celebix.site",
    panelUrl: "https://panel.celebix.site",
    provisioningStatus: "ready",
    session: "pending",
  };
}

function errorBody(fixture: ErrorFixture, overrides: Record<string, unknown> = {}) {
  return {
    code: fixture.code,
    state: fixture.state,
    retryable: fixture.retryable,
    ...(fixture.restartRegistration ? { restartRegistration: true } : {}),
    message: messages[fixture.code],
    ...overrides,
  };
}

function upstream(body: Record<string, unknown>, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

async function rejected(body: Record<string, unknown>, status: number): Promise<void> {
  await assert.rejects(projectSafeCallbackResponse(upstream(body, status), 4_096), /callback_response_invalid/);
}

test("customer projector accepts every reachable exact B1B2A response and re-emits canonical keys", async () => {
  for (const state of successStates) {
    const expected = successBody(state);
    const response = await projectSafeCallbackResponse(upstream(expected, 200), 4_096);
    assert.equal(response.status, 200, state);
    assert.deepEqual(await response.json(), expected, state);
  }
  for (const fixture of errorFixtures) {
    for (const status of fixture.statuses) {
      const expected = errorBody(fixture);
      const response = await projectSafeCallbackResponse(upstream(expected, status), 4_096);
      assert.equal(response.status, status, `${fixture.state}:${fixture.code}`);
      assert.deepEqual(await response.json(), expected, `${fixture.state}:${fixture.code}`);
    }
  }
});

test("customer projector rejects arbitrary, PII, callback-secret, token, SQL, identifier, URL, and stack messages", async () => {
  const fixture = errorFixtures.find((entry) => entry.code === "self_serve_callback_untrusted")!;
  for (const message of [
    "Arbitrary printable upstream text",
    "owner@example.com",
    "state=secret authorization_code=secret",
    "access_token=secret refresh_token=secret id_token=secret",
    "nonce=secret code_verifier=secret",
    "operation_id=op attempt_id=attempt principal_id=principal store_id=store tenant_id=tenant",
    "SQLSTATE 23505 SELECT * FROM saas.registration_workflows",
    "https://owner-internal.example.test/private https://provider.example/token",
    "Error: secret\n    at internalCallback (owner.ts:10:2)",
  ]) {
    await rejected(errorBody(fixture, { message }), 401);
  }
});

test("customer projector binds every error to exact status and retryable semantics", async () => {
  for (const fixture of errorFixtures) {
    const wrongStatus = fixture.statuses.includes(418) ? 500 : 418;
    await rejected(errorBody(fixture), wrongStatus);
    await rejected(errorBody(fixture, { retryable: !fixture.retryable }), fixture.statuses[0]);
  }
  await rejected(errorBody(errorFixtures.find((entry) => entry.state === "commit_unknown")!, { retryable: true }), 503);
});

test("customer projector binds restartRegistration presence and value exactly", async () => {
  for (const fixture of errorFixtures.filter((entry) => entry.restartRegistration)) {
    const body = errorBody(fixture);
    delete body.restartRegistration;
    await rejected(body, fixture.statuses[0]);
    await rejected(errorBody(fixture, { restartRegistration: false }), fixture.statuses[0]);
  }
  const pending = errorFixtures.find((entry) => entry.state === "in_progress")!;
  await rejected(errorBody(pending, { restartRegistration: true }), 202);
});

test("customer projector rejects wrong state/code pairs, unreachable replay output, unknown fields, and non-200 success", async () => {
  const pending = errorFixtures.find((entry) => entry.state === "in_progress")!;
  await rejected(errorBody(pending, { state: "commit_unknown" }), 202);
  await rejected(errorBody(pending, { code: "self_serve_completion_rejected" }), 202);
  await rejected(errorBody(pending, { internal: "secret" }), 202);
  await rejected({
    code: "self_serve_oidc_state_replayed",
    state: "rejected",
    retryable: false,
    message: "Kimlik doğrulama durumu daha önce kullanıldı.",
  }, 409);
  await rejected(successBody(), 201);
  await rejected({ ...successBody(), code: "unexpected" }, 200);
});

test("customer projector rejects the reconciliation status/retry regression", async () => {
  await rejected({
    code: "self_serve_completion_reconciliation_required",
    state: "commit_unknown",
    retryable: true,
    message: messages.self_serve_completion_reconciliation_required,
  }, 503);
});

test("customer projector rejects malformed JSON, malformed UTF-8, and oversized bodies while retaining bounded valid output", async () => {
  await assert.rejects(projectSafeCallbackResponse(new Response("{"), 4_096), /callback_response_invalid/);
  await assert.rejects(
    projectSafeCallbackResponse(new Response(new Uint8Array([0xc3, 0x28])), 4_096),
    /callback_response_invalid/,
  );
  await assert.rejects(projectSafeCallbackResponse(upstream(errorBody(errorFixtures[0]), 405), 8), /callback_response_invalid/);
  const response = await projectSafeCallbackResponse(upstream(successBody(), 200), 4_096);
  assert.deepEqual(await response.json(), successBody());
});

test("customer projector strips Set-Cookie and Location and keeps audit-independent cache control", async () => {
  const response = await projectSafeCallbackResponse(
    upstream(successBody(), 200, { "set-cookie": "secret=session", location: "https://internal.example/private" }),
    4_096,
  );
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
