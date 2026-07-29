import assert from "node:assert/strict";
import test from "node:test";

import {
  openMerchantProviderCredential,
  parseMerchantProviderCredentialKeyring,
  sealMerchantProviderCredential,
} from "./index.ts";

const PROFILE = "40000000-0000-4000-8000-000000000005";
const STORE = "10000000-0000-4000-8000-000000000001";
const KEY = Buffer.alloc(32, 0x41).toString("base64url");

function source() {
  return {
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: "provider.current",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: `provider.current:${KEY}`,
  };
}

test("panel seal and owner open share one exact dedicated provider credential keyring contract", () => {
  const panelKeyring = parseMerchantProviderCredentialKeyring(source());
  const ownerKeyring = parseMerchantProviderCredentialKeyring(source());
  const plaintext = new TextEncoder().encode('{"merchantKey":"key","merchantSalt":"salt"}');
  const envelope = sealMerchantProviderCredential({
    plaintext,
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    credentialVersion: 1,
    keyring: panelKeyring,
  });
  const opened = openMerchantProviderCredential({
    envelope,
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    credentialVersion: 1,
    keyring: ownerKeyring,
  });
  assert.deepEqual(opened, plaintext);
  plaintext.fill(0);
  opened.fill(0);
});

test("dedicated provider keyring parser rejects missing duplicated or malformed authority", () => {
  for (const invalid of [
    {},
    { ...source(), CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: "missing" },
    { ...source(), CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: `provider.current:${KEY},provider.next:${KEY}` },
    { ...source(), CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: "provider.current:not-a-key" },
  ]) assert.throws(() => parseMerchantProviderCredentialKeyring(invalid), /provider_credential_keyring_config_invalid/);
});
