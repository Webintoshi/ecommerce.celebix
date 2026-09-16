import assert from "node:assert/strict";
import test from "node:test";

import { parseInvitationDeliveryConfig } from "./delivery-config.ts";

const INVALID = "store_admin_invitation_config_invalid";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_ADMIN_INVITATIONS_ENABLED: "true",
    CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: "re_invitation_test_authority",
    CELEBIX_ADMIN_INVITATIONS_FROM: "davet@notify.celebix.co",
    CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://accounts.celebix.co",
    CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID: "11111111-1111-4111-8111-111111111111",
    CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT: "pilot+admin@example.com",
    ...overrides,
  };
}

function rejectsInvalid(source: Readonly<Record<string, string | undefined>>): void {
  assert.throws(
    () => parseInvitationDeliveryConfig(source),
    (error: unknown) => error instanceof Error && error.message === INVALID,
  );
}

test("disabled invitations require no invitation values and never reuse another service key", () => {
  assert.equal(parseInvitationDeliveryConfig({}), null);
  assert.equal(parseInvitationDeliveryConfig({ CELEBIX_ADMIN_INVITATIONS_ENABLED: "false" }), null);
  assert.equal(parseInvitationDeliveryConfig({
    CELEBIX_ORDER_EMAIL_RESEND_API_KEY: "re_private_order_email_authority",
    STOREFRONT_RESEND_API_KEY: "re_private_storefront_authority",
  }), null);
});
test("enabled invitations return one frozen, dedicated delivery authority", () => {
  const result = parseInvitationDeliveryConfig(environment());

  assert.deepEqual(result, {
    apiKey: "re_invitation_test_authority",
    sender: "davet@notify.celebix.co",
    acceptanceOrigin: "https://accounts.celebix.co",
    allowedStoreId: "11111111-1111-4111-8111-111111111111",
    allowedRecipient: "pilot+admin@example.com",
  });
  assert.equal(Object.isFrozen(result), true);
});

test("enabled invitations fail closed when any dedicated value is absent", () => {
  for (const name of [
    "CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY",
    "CELEBIX_ADMIN_INVITATIONS_FROM",
    "CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN",
    "CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID",
    "CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT",
  ]) {
    rejectsInvalid(environment({ [name]: undefined }));
  }

  rejectsInvalid({
    CELEBIX_ADMIN_INVITATIONS_ENABLED: "true",
    CELEBIX_ORDER_EMAIL_RESEND_API_KEY: "re_private_order_email_authority",
    CELEBIX_ORDER_EMAIL_FROM: "orders@notify.celebix.co",
  });
});

test("mode and every authority value must be canonical and safe", () => {
  for (const source of [
    environment({ CELEBIX_ADMIN_INVITATIONS_ENABLED: "TRUE" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ENABLED: " false" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: "re_short" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: " re_invitation_test_authority" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: "re_invitation.test" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_FROM: "Davet@notify.celebix.co" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_FROM: "Celebix <davet@notify.celebix.co>" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT: " pilot+admin@example.com " }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT: "pılot@example.com" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "http://accounts.celebix.co" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://accounts.celebix.co/" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID: "11111111-1111-4111-8111-11111111111A" }),
    environment({ CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID: "11111111-1111-0111-8111-111111111111" }),
  ]) rejectsInvalid(source);
});
