import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  openOrderEmailRequest,
  sealOrderEmailRequest,
  type OrderEmailKeyring,
  type OrderEmailProviderRequest,
} from "./seal.ts";

const request: OrderEmailProviderRequest = Object.freeze({
  from: "Güzide Kuyumcu <siparis@notify.celebix.co>",
  to: "ada@example.test",
  replyTo: "destek@example.test",
  subject: "Siparişinizi aldık · GK-1042",
  html: "<p>Siparişinizi aldık.</p>",
  text: "Siparişinizi aldık.",
});

function keyring(activeKeyId = "order_email_02"): OrderEmailKeyring {
  return Object.freeze({
    activeKeyId,
    keys: Object.freeze({
      order_email_01: Buffer.alloc(32, 1),
      order_email_02: Buffer.alloc(32, 2),
    }),
  });
}

test("order email request is authenticated, opaque, canonical, and deeply frozen", () => {
  const selected = keyring();
  const originalKey = Buffer.from(selected.keys.order_email_02!);
  const sealed = sealOrderEmailRequest(request, selected, () => Buffer.alloc(12, 7));
  assert.equal(sealed.version, "oe1");
  assert.equal(sealed.keyId, "order_email_02");
  assert.match(sealed.digest, /^[a-f0-9]{64}$/u);
  assert.equal(sealed.bytes.includes(Buffer.from(request.to)), false);
  assert.deepEqual(selected.keys.order_email_02, originalKey);

  const opened = openOrderEmailRequest(sealed, selected);
  assert.deepEqual(opened, request);
  assert.equal(Object.isFrozen(opened), true);
});

test("tampering, wrong key, malformed requests, and unknown rotation keys fail closed", () => {
  const sealed = sealOrderEmailRequest(request, keyring(), () => Buffer.alloc(12, 3));
  const tampered = { ...sealed, bytes: Buffer.from(sealed.bytes) };
  tampered.bytes[tampered.bytes.length - 1] ^= 1;
  assert.throws(() => openOrderEmailRequest(tampered, keyring()), /order_email_seal_invalid/u);
  assert.throws(() => openOrderEmailRequest(sealed, { activeKeyId: "order_email_01", keys: { order_email_02: randomBytes(32) } }), /order_email_seal_invalid/u);
  assert.throws(() => openOrderEmailRequest({ ...sealed, keyId: "retired_key" }, keyring()), /order_email_seal_invalid/u);
  assert.throws(() => sealOrderEmailRequest({ ...request, to: "not-an-email" }, keyring()), /order_email_seal_invalid/u);
  assert.throws(() => sealOrderEmailRequest({ ...request, html: `${request.html}<script>x</script>` }, keyring()), /order_email_seal_invalid/u);
});

