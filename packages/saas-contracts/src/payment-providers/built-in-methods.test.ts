import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILT_IN_PAYMENT_METHODS,
  isBuiltInPaymentMethodKind,
  normalizeTurkishIbanInput,
  parseBuiltInPaymentMethodConfig,
} from "./built-in-methods.ts";
import * as payments from "./index.ts";
import * as root from "../index.ts";

const validBankTransfer = () => ({
  bankName: "Örnek Bankası",
  accountHolder: "Örnek Ticaret Ltd. Şti.",
  iban: "TR330006100519786457841326",
  instructions: "Sipariş numaranızı yazın.",
});

function assertInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => (
    error instanceof TypeError && error.message === "built_in_payment_method_invalid"
  ));
}

test("built-in payment methods expose the two immutable supported kinds from both contract entrypoints", () => {
  assert.deepEqual(BUILT_IN_PAYMENT_METHODS, ["cash_on_delivery", "bank_transfer"]);
  assert.equal(Object.isFrozen(BUILT_IN_PAYMENT_METHODS), true);
  assert.equal(payments.BUILT_IN_PAYMENT_METHODS, BUILT_IN_PAYMENT_METHODS);
  assert.equal(root.BUILT_IN_PAYMENT_METHODS, BUILT_IN_PAYMENT_METHODS);
  assert.equal(isBuiltInPaymentMethodKind("cash_on_delivery"), true);
  assert.equal(isBuiltInPaymentMethodKind("bank_transfer"), true);
  assert.equal(isBuiltInPaymentMethodKind("provider"), false);
  assert.equal(isBuiltInPaymentMethodKind(42), false);
});

test("IBAN input normalization removes only ASCII spaces and uppercases Turkish form input", () => {
  assert.equal(
    normalizeTurkishIbanInput("tr33 0006 1005 1978 6457 8413 26"),
    "TR330006100519786457841326",
  );
  assert.equal(normalizeTurkishIbanInput(" tr33\u00a00006 "), "TR33\u00a00006");
});

test("cash-on-delivery parsing returns a copied frozen exact configuration", () => {
  const source = { instructions: "Teslimatta ödeme yapın." };
  const parsed = parseBuiltInPaymentMethodConfig("cash_on_delivery", source);
  assert.deepEqual(parsed, { instructions: "Teslimatta ödeme yapın." });
  assert.equal(Object.isFrozen(parsed), true);
  source.instructions = "Değiştirildi.";
  assert.equal(parsed.instructions, "Teslimatta ödeme yapın.");
});

test("cash-on-delivery accepts empty instructions and rejects invalid instruction text", () => {
  assert.deepEqual(parseBuiltInPaymentMethodConfig("cash_on_delivery", { instructions: "" }), { instructions: "" });
  for (const instructions of [" teslimatta ödeyin", "teslimatta ödeyin ", "\u0000", "x".repeat(501), "🙂".repeat(126)]) {
    assertInvalid(() => parseBuiltInPaymentMethodConfig("cash_on_delivery", { instructions }));
  }
});

test("bank-transfer parsing accepts canonical bounded fields and deeply freezes the copy", () => {
  const source = validBankTransfer();
  const parsed = parseBuiltInPaymentMethodConfig("bank_transfer", source);
  assert.deepEqual(parsed, validBankTransfer());
  assert.equal(Object.isFrozen(parsed), true);
  source.bankName = "Değiştirildi";
  assert.equal(parsed.bankName, "Örnek Bankası");
});

test("bank-transfer field bounds measure UTF-8 bytes and reject untrimmed or control-bearing text", () => {
  for (const hostile of [
    { ...validBankTransfer(), bankName: "A" },
    { ...validBankTransfer(), bankName: "b".repeat(121) },
    { ...validBankTransfer(), bankName: "🙂".repeat(31) },
    { ...validBankTransfer(), bankName: " Banka" },
    { ...validBankTransfer(), accountHolder: "A" },
    { ...validBankTransfer(), accountHolder: "h".repeat(161) },
    { ...validBankTransfer(), accountHolder: "🙂".repeat(41) },
    { ...validBankTransfer(), accountHolder: "Hesap\nSahibi" },
    { ...validBankTransfer(), instructions: "i".repeat(501) },
    { ...validBankTransfer(), instructions: "Bilgi\u007f" },
  ]) {
    assertInvalid(() => parseBuiltInPaymentMethodConfig("bank_transfer", hostile));
  }
});

test("bank-transfer requires a canonical checksum-valid Turkish IBAN", () => {
  assert.deepEqual(parseBuiltInPaymentMethodConfig("bank_transfer", validBankTransfer()), validBankTransfer());
  for (const iban of [
    "TR330006100519786457841327",
    "tr330006100519786457841326",
    "TR33 0006100519786457841326",
    "TR33000610051978645784132",
    "DE89370400440532013000",
    "TR33000610051978645784132A",
  ]) {
    assertInvalid(() => parseBuiltInPaymentMethodConfig("bank_transfer", { ...validBankTransfer(), iban }));
  }
});

test("parsers reject unknown kinds and all hidden or executable configuration shapes without invoking accessors", () => {
  const inherited = Object.create({ instructions: "Teslimatta ödeme yapın." });
  const accessor = {} as { instructions?: string };
  let accessorInvoked = false;
  Object.defineProperty(accessor, "instructions", {
    enumerable: true,
    get() {
      accessorInvoked = true;
      return "Teslimatta ödeme yapın.";
    },
  });
  const transparentProxy = new Proxy({ instructions: "Teslimatta ödeme yapın." }, {});
  const symbolKey = { instructions: "Teslimatta ödeme yapın.", [Symbol("hidden")]: true };
  for (const hostile of [
    null,
    [],
    Object.create(null),
    inherited,
    accessor,
    transparentProxy,
    symbolKey,
    { instructions: "Teslimatta ödeme yapın.", unexpected: true },
  ]) {
    assertInvalid(() => parseBuiltInPaymentMethodConfig("cash_on_delivery", hostile));
  }
  assertInvalid(() => parseBuiltInPaymentMethodConfig("provider", { instructions: "Teslimatta ödeme yapın." }));
  assert.equal(accessorInvoked, false);
});
