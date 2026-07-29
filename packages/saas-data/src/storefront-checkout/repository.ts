import { createHash, randomBytes } from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  parseCheckoutPolicy,
  parseCheckoutQuote,
  parseCheckoutStatus,
  parseCheckoutAddress,
  parseCheckoutSubmissionResult,
  type CheckoutPolicy,
  type CheckoutQuote,
  type CheckoutStatus,
  type CheckoutSubmissionResult,
} from "@celebix/saas-contracts";

import {
  acquirePostgresClient,
  type PostgresClientLike,
} from "../postgres/pool.ts";
import {
  exposePublicCheckoutError,
  isTrustedPublicCheckoutError,
  trustedPublicCheckoutError,
  type PublicCheckoutErrorCode,
} from "./errors.ts";
import type {
  BeginHostedCheckoutInput,
  CheckoutOperationRecovery,
  GetCheckoutPolicyInput,
  GetCheckoutStatusInput,
  HostedCheckoutAuthority,
  IssueCheckoutNonceInput,
  PostgresPublicCheckoutRepositoryOptions,
  PublicCheckoutRepository,
  RecoverCheckoutOperationInput,
  SubmitBuiltInCheckoutInput,
  UpdateCheckoutDeliveryInput,
} from "./types.ts";
import {
  beginHostedCheckoutInput,
  exactCheckoutInput,
  getCheckoutPolicyInput,
  getCheckoutStatusInput,
  issueCheckoutNonceInput,
  recoverCheckoutOperationInput,
  submitBuiltInCheckoutInput,
  updateCheckoutDeliveryInput,
} from "./validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type Selected = Readonly<{ outcome: string; resultPayload: unknown }>;

const QUOTE_KEYS = Object.freeze([
  "schemaVersion",
  "cartId",
  "cartVersion",
  "storeName",
  "currency",
  "locale",
  "items",
  "shippingOptions",
  "selectedShippingId",
  "paymentMethods",
  "policyLinks",
  "subtotalCents",
  "shippingCents",
  "discountCents",
  "totalCents",
  "discountCode",
]);
const DIRECT_OUTCOMES = new Set<PublicCheckoutErrorCode>([
  "invalid_input",
  "not_found",
  "version_conflict",
  "discount_invalid",
  "stock_unavailable",
  "payment_method_unavailable",
  "operation_mismatch",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f-\u009f]+$/;

function unavailable(): never {
  throw trustedPublicCheckoutError("unavailable");
}

function commitUnknown(): never {
  throw trustedPublicCheckoutError("commit_unknown");
}

function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) {
    unavailable();
  }
  return `${String(value)}ms`;
}

function strictProjection(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) ||
      nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(descriptors, key))
    ) unavailable();
    const copy: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") unavailable();
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) unavailable();
      copy[key] = descriptor.value;
    }
    return copy;
  } catch (error) {
    if (isTrustedPublicCheckoutError(error)) throw error;
    return unavailable();
  }
}

function single(result: unknown): Selected {
  try {
    if (typeof result !== "object" || result === null || nodeTypes.isProxy(result)) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(result);
    const rowsDescriptor = descriptors.rows;
    const rowCountDescriptor = descriptors.rowCount;
    if (
      !rowsDescriptor || !("value" in rowsDescriptor) ||
      !rowCountDescriptor || !("value" in rowCountDescriptor)
    ) unavailable();
    const rows = rowsDescriptor.value;
    if (
      !Array.isArray(rows) || nodeTypes.isProxy(rows) ||
      Object.getPrototypeOf(rows) !== Array.prototype
    ) unavailable();
    const rowDescriptors = Object.getOwnPropertyDescriptors(rows) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >;
    const length = rowDescriptors.length;
    const first = rowDescriptors["0"];
    if (
      !length || !("value" in length) || length.value !== 1 ||
      Reflect.ownKeys(rowDescriptors).length !== 2 ||
      rowCountDescriptor.value !== 1 ||
      !first || !("value" in first) || !first.enumerable
    ) unavailable();
    const row = strictProjection(first.value, ["outcome", "result_payload"]);
    if (
      typeof row.outcome !== "string" ||
      row.outcome.length < 1 ||
      row.outcome.length > 64
    ) unavailable();
    return Object.freeze({ outcome: row.outcome, resultPayload: row.result_payload });
  } catch (error) {
    if (isTrustedPublicCheckoutError(error)) throw error;
    return unavailable();
  }
}

function throwOutcome(outcome: string, resultPayload: unknown): never {
  if (resultPayload === null && DIRECT_OUTCOMES.has(outcome as PublicCheckoutErrorCode)) {
    throw trustedPublicCheckoutError(outcome as PublicCheckoutErrorCode);
  }
  return unavailable();
}

function safeQuote(value: unknown, checkoutNonce: string): CheckoutQuote {
  try {
    const selected = strictProjection(value, QUOTE_KEYS);
    return parseCheckoutQuote(Object.freeze({ ...selected, checkoutNonce }));
  } catch {
    return unavailable();
  }
}

function safeStatus(value: unknown): CheckoutStatus {
  try {
    return parseCheckoutStatus(value);
  } catch {
    return unavailable();
  }
}

function safePolicy(value: unknown): CheckoutPolicy {
  try {
    return parseCheckoutPolicy(value);
  } catch {
    return unavailable();
  }
}

function safeSubmission(value: unknown): CheckoutSubmissionResult {
  try {
    return parseCheckoutSubmissionResult(value);
  } catch {
    return unavailable();
  }
}

function outputText(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" || value.length < minimum || value.length > maximum ||
    value !== value.trim() || !SAFE_TEXT.test(value)
  ) unavailable();
  return value;
}

function outputUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) unavailable();
  return value;
}

function outputInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) unavailable();
  return value as number;
}

function outputIdentityNumber(value: unknown): string | null {
  if (value === null) return null;
  const selected = outputText(value, 5, 50);
  if (
    !/^[\x21-\x7e]{5,50}$/.test(selected) || /^(.)\1+$/.test(selected) ||
    selected === "12345678901"
  ) unavailable();
  return selected;
}

function safeHostedAuthority(
  value: unknown,
  expected: BeginHostedCheckoutInput,
): HostedCheckoutAuthority {
  try {
    const selected = strictProjection(value, [
      "storeId", "paymentMethodId", "profileId", "providerCode", "orderReference",
      "amountMinor", "currency", "customer", "basket", "attemptId", "bridgeId",
      "environment", "reservationStatus",
    ]);
    if (
      (selected.providerCode !== "paytr_iframe" && selected.providerCode !== "iyzico_iframe") ||
      selected.currency !== "TRY" ||
      (selected.environment !== "test" && selected.environment !== "live") ||
      selected.reservationStatus !== "held"
    ) unavailable();
    const customer = strictProjection(selected.customer, [
      "name", "email", "phone", "identityNumber", "shippingAddress", "billingAddress",
    ]);
    const parsedCustomer = Object.freeze({
      name: outputText(customer.name, 1, 241),
      email: outputText(customer.email, 3, 320),
      phone: outputText(customer.phone, 7, 32),
      identityNumber: outputIdentityNumber(customer.identityNumber),
      shippingAddress: parseCheckoutAddress(customer.shippingAddress),
      billingAddress: customer.billingAddress === null
        ? null
        : parseCheckoutAddress(customer.billingAddress),
    });
    if (
      !Array.isArray(selected.basket) || nodeTypes.isProxy(selected.basket) ||
      Object.getPrototypeOf(selected.basket) !== Array.prototype ||
      selected.basket.length < 1 || selected.basket.length > 100
    ) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(selected.basket);
    const lengthDescriptor = (descriptors as unknown as Record<PropertyKey, PropertyDescriptor>)[
      "length"
    ];
    if (
      Reflect.ownKeys(descriptors).length !== selected.basket.length + 1 ||
      !lengthDescriptor || !("value" in lengthDescriptor) ||
      lengthDescriptor.value !== selected.basket.length
    ) unavailable();
    const basket = selected.basket.map((item) => {
      const parsed = strictProjection(item, [
        "reference", "name", "quantity", "unitAmountMinor", "itemType",
      ]);
      if (parsed.itemType !== "PHYSICAL" && parsed.itemType !== "VIRTUAL") unavailable();
      return Object.freeze({
        reference: outputText(parsed.reference, 1, 160),
        name: outputText(parsed.name, 1, 240),
        quantity: outputInteger(parsed.quantity, 1),
        unitAmountMinor: outputInteger(parsed.unitAmountMinor),
        itemType: parsed.itemType,
      });
    });
    if (new Set(basket.map((item) => item.reference)).size !== basket.length) unavailable();
    const paymentMethodId = outputUuid(selected.paymentMethodId);
    const attemptId = outputUuid(selected.attemptId);
    const bridgeId = outputUuid(selected.bridgeId);
    if (
      paymentMethodId !== expected.submission.paymentMethodId ||
      attemptId !== expected.attemptId || bridgeId !== expected.attemptId ||
      parsedCustomer.identityNumber !== expected.submission.identityNumber ||
      (selected.providerCode === "iyzico_iframe" && parsedCustomer.identityNumber === null)
    ) unavailable();
    return Object.freeze({
      storeId: outputUuid(selected.storeId),
      paymentMethodId,
      profileId: outputUuid(selected.profileId),
      providerCode: selected.providerCode,
      orderReference: outputText(selected.orderReference, 1, 160),
      amountMinor: outputInteger(selected.amountMinor, 1),
      currency: "TRY",
      customer: parsedCustomer,
      basket: Object.freeze(basket),
      attemptId,
      bridgeId,
      environment: selected.environment,
      reservationStatus: "held",
    });
  } catch (error) {
    if (isTrustedPublicCheckoutError(error)) throw error;
    return unavailable();
  }
}

function sameQuote(left: CheckoutQuote, right: CheckoutQuote): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(input: UpdateCheckoutDeliveryInput): string {
  const delivery = input.delivery;
  return createHash("sha256").update(JSON.stringify({
    action: "delivery",
    hostname: input.hostname,
    credentialDigest: input.credentialDigest,
    cartVersion: delivery.cartVersion,
    currentNonceDigest: digest(delivery.checkoutNonce),
    operationId: delivery.operationId,
    email: delivery.email,
    marketingOptIn: delivery.marketingOptIn,
    shippingAddress: delivery.shippingAddress,
    billingAddress: delivery.billingAddress,
    shippingId: delivery.shippingId,
    discountCode: delivery.discountCode,
  })).digest("hex");
}

function submissionFingerprint(
  input: SubmitBuiltInCheckoutInput,
  action: "submit_builtin" | "begin_hosted",
  hosted?: BeginHostedCheckoutInput,
): string {
  return createHash("sha256").update(JSON.stringify({
    action,
    hostname: input.hostname,
    credentialDigest: input.credentialDigest,
    cartVersion: input.submission.cartVersion,
    currentNonceDigest: digest(input.submission.checkoutNonce),
    operationId: input.submission.operationId,
    paymentMethodId: input.submission.paymentMethodId,
    consents: input.submission.consents,
    ...(hosted === undefined ? {} : {
      attemptId: hosted.attemptId,
      callbackBindingDigest: hosted.callbackBindingDigest,
      identityNumberDigest: hosted.submission.identityNumber === null
        ? null
        : digest(hosted.submission.identityNumber),
    }),
  })).digest("hex");
}

function freshNonce(): Readonly<{ credential: string; digest: string }> {
  const credential = randomBytes(32).toString("base64url");
  return Object.freeze({ credential, digest: digest(credential) });
}

function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try {
    client.release(destroy);
  } catch {
    // Cleanup is best effort; provider errors are never exposed.
  }
}

async function rollback(client: PostgresClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
    safeRelease(client);
  } catch {
    safeRelease(client, true);
  }
}

function expose<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    throw exposePublicCheckoutError(error, "unavailable");
  });
}

export class PostgresPublicCheckoutRepository implements PublicCheckoutRepository {
  private readonly options: PostgresPublicCheckoutRepositoryOptions;

  constructor(options: PostgresPublicCheckoutRepositoryOptions) {
    try {
      const parsed = exactCheckoutInput(options, ["pool", "role", "timeouts", "audit"]);
      const parsedTimeouts = exactCheckoutInput(parsed.timeouts, [
        "poolCheckoutMs",
        "statementMs",
        "lockMs",
        "idleTransactionMs",
      ]);
      if (parsed.role !== "celebix_saas_workflow" || typeof parsed.audit !== "function") {
        unavailable();
      }
      const timeouts = Object.freeze({
        poolCheckoutMs: parsedTimeouts.poolCheckoutMs as number,
        statementMs: parsedTimeouts.statementMs as number,
        lockMs: parsedTimeouts.lockMs as number,
        idleTransactionMs: parsedTimeouts.idleTransactionMs as number,
      });
      timeout(timeouts.poolCheckoutMs);
      timeout(timeouts.statementMs);
      timeout(timeouts.lockMs);
      timeout(timeouts.idleTransactionMs);
      this.options = Object.freeze({
        pool: parsed.pool as PostgresPublicCheckoutRepositoryOptions["pool"],
        role: "celebix_saas_workflow",
        timeouts,
        audit: parsed.audit as PostgresPublicCheckoutRepositoryOptions["audit"],
      });
    } catch {
      throw exposePublicCheckoutError(undefined, "unavailable");
    }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try {
      return await acquirePostgresClient(
        this.options.pool,
        this.options.timeouts.poolCheckoutMs,
      );
    } catch {
      return unavailable();
    }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query(
      "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
      [timeout(this.options.timeouts.statementMs)],
    );
    await client.query(
      "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
      [timeout(this.options.timeouts.lockMs)],
    );
    await client.query(
      "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
      [timeout(this.options.timeouts.idleTransactionMs)],
    );
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
  }

  private auditCommitUnknown(): void {
    try {
      const pending = this.options.audit(Object.freeze({
        type: "storefront_checkout_commit_unknown",
      }));
      void Promise.resolve(pending).catch(() => undefined);
    } catch {
      // Audit is observational and contains no nonce or checkout authority.
    }
  }

  private async read(spec: QuerySpec): Promise<Selected> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = single(await client.query(spec.text, spec.values));
      try {
        await client.query("COMMIT");
        terminal = true;
        safeRelease(client);
        return result;
      } catch {
        terminal = true;
        safeRelease(client, true);
        return unavailable();
      }
    } catch (error) {
      if (began && !terminal) await rollback(client);
      else if (!terminal) safeRelease(client, true);
      if (isTrustedPublicCheckoutError(error)) throw error;
      return unavailable();
    }
  }

  private async recoverDelivery(
    input: RecoverCheckoutOperationInput,
  ): Promise<CheckoutQuote> {
    if (input.expected.kind !== "delivery") unavailable();
    const selected = await this.read({
      text: `SELECT outcome, result_payload FROM saas.storefront_checkout_recover_operation(
        $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz
      )`,
      values: [
        input.hostname,
        input.credentialDigest,
        input.operationId,
        input.fingerprint,
        input.now,
      ],
    });
    if (selected.outcome !== "operation_replayed") {
      throwOutcome(selected.outcome, selected.resultPayload);
    }
    return safeQuote(selected.resultPayload, input.expected.checkoutNonce);
  }

  private async recoverUnknownDelivery(
    input: RecoverCheckoutOperationInput,
    observed: CheckoutQuote,
  ): Promise<CheckoutQuote> {
    try {
      const recovered = await this.recoverDelivery(input);
      if (!sameQuote(observed, recovered)) commitUnknown();
      return recovered;
    } catch {
      return commitUnknown();
    }
  }

  private async recoverUnknownIssue(
    input: IssueCheckoutNonceInput,
    checkoutNonce: string,
  ): Promise<never> {
    try {
      const selected = await this.read({
        text: `SELECT outcome, result_payload FROM saas.storefront_checkout_get_quote(
          $1::text,$2::text,$3::timestamptz
        )`,
        values: [input.hostname, input.credentialDigest, input.now],
      });
      if (selected.outcome === "found") safeQuote(selected.resultPayload, checkoutNonce);
    } catch {
      // The read is evidence gathering only: migration 064 cannot prove the nonce digest.
    }
    return commitUnknown();
  }

  private async recoverUnknownSubmission<T>(
    input: RecoverCheckoutOperationInput,
    observed: T,
    parser: (value: unknown) => T,
  ): Promise<T> {
    try {
      const selected = await this.read({
        text: `SELECT outcome, result_payload FROM saas.storefront_checkout_recover_operation(
          $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz
        )`,
        values: [
          input.hostname,
          input.credentialDigest,
          input.operationId,
          input.fingerprint,
          input.now,
        ],
      });
      if (selected.outcome !== "operation_replayed") commitUnknown();
      const recovered = parser(selected.resultPayload);
      if (JSON.stringify(recovered) !== JSON.stringify(observed)) commitUnknown();
      return recovered;
    } catch {
      return commitUnknown();
    }
  }

  private async executeSubmission<T>(
    spec: QuerySpec,
    parser: (value: unknown) => T,
    allowedOutcomes: ReadonlySet<string>,
    recovery: RecoverCheckoutOperationInput,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const selected = single(await client.query(spec.text, spec.values));
      if (!allowedOutcomes.has(selected.outcome)) {
        throwOutcome(selected.outcome, selected.resultPayload);
      }
      const parsed = parser(selected.resultPayload);
      try {
        await client.query("COMMIT");
        terminal = true;
        safeRelease(client);
        return parsed;
      } catch {
        terminal = true;
        safeRelease(client, true);
        this.auditCommitUnknown();
        return await this.recoverUnknownSubmission(recovery, parsed, parser);
      }
    } catch (error) {
      if (began && !terminal) await rollback(client);
      else if (!terminal) safeRelease(client, true);
      if (isTrustedPublicCheckoutError(error)) throw error;
      return unavailable();
    }
  }

  issueNonce(input: IssueCheckoutNonceInput): Promise<CheckoutQuote> {
    return expose(async () => {
      const parsed = issueCheckoutNonceInput(input);
      const nonce = freshNonce();
      const client = await this.acquire();
      let began = false;
      let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        await this.configure(client);
        const selected = single(await client.query(
          `SELECT outcome, result_payload FROM saas.storefront_checkout_issue_nonce(
            $1::text,$2::text,$3::text,$4::timestamptz
          )`,
          [parsed.hostname, parsed.credentialDigest, nonce.digest, parsed.now],
        ));
        if (selected.outcome !== "issued") {
          throwOutcome(selected.outcome, selected.resultPayload);
        }
        const quote = safeQuote(selected.resultPayload, nonce.credential);
        try {
          await client.query("COMMIT");
          terminal = true;
          safeRelease(client);
          return quote;
        } catch {
          terminal = true;
          safeRelease(client, true);
          this.auditCommitUnknown();
          return await this.recoverUnknownIssue(parsed, nonce.credential);
        }
      } catch (error) {
        if (began && !terminal) await rollback(client);
        else if (!terminal) safeRelease(client, true);
        if (isTrustedPublicCheckoutError(error)) throw error;
        return unavailable();
      }
    });
  }

  updateDelivery(input: UpdateCheckoutDeliveryInput): Promise<CheckoutQuote> {
    return expose(async () => {
      const parsed = updateCheckoutDeliveryInput(input);
      const nextNonce = freshNonce();
      const operationFingerprint = fingerprint(parsed);
      const client = await this.acquire();
      let began = false;
      let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        await this.configure(client);
        const selected = single(await client.query(
          `SELECT outcome, result_payload FROM saas.storefront_checkout_update_delivery(
            $1::text,$2::text,$3::bigint,$4::uuid,$5::text,$6::text,$7::text,
            $8::text,$9::boolean,$10::jsonb,$11::jsonb,$12::text,$13::text,$14::timestamptz
          )`,
          [
            parsed.hostname,
            parsed.credentialDigest,
            parsed.delivery.cartVersion,
            parsed.delivery.operationId,
            operationFingerprint,
            digest(parsed.delivery.checkoutNonce),
            nextNonce.digest,
            parsed.delivery.email,
            parsed.delivery.marketingOptIn,
            JSON.stringify(parsed.delivery.shippingAddress),
            parsed.delivery.billingAddress === null
              ? null
              : JSON.stringify(parsed.delivery.billingAddress),
            parsed.delivery.shippingId,
            parsed.delivery.discountCode,
            parsed.now,
          ],
        ));
        if (selected.outcome === "operation_replayed") commitUnknown();
        if (selected.outcome !== "updated") {
          throwOutcome(selected.outcome, selected.resultPayload);
        }
        const quote = safeQuote(selected.resultPayload, nextNonce.credential);
        try {
          await client.query("COMMIT");
          terminal = true;
          safeRelease(client);
          return quote;
        } catch {
          terminal = true;
          safeRelease(client, true);
          this.auditCommitUnknown();
          return await this.recoverUnknownDelivery(
            Object.freeze({
              hostname: parsed.hostname,
              credentialDigest: parsed.credentialDigest,
              operationId: parsed.delivery.operationId,
              fingerprint: operationFingerprint,
              expected: Object.freeze({
                kind: "delivery" as const,
                checkoutNonce: nextNonce.credential,
              }),
              now: parsed.now,
            }),
            quote,
          );
        }
      } catch (error) {
        if (began && !terminal) await rollback(client);
        else if (!terminal) safeRelease(client, true);
        if (isTrustedPublicCheckoutError(error)) throw error;
        return unavailable();
      }
    });
  }

  submitBuiltIn(input: SubmitBuiltInCheckoutInput): Promise<CheckoutSubmissionResult> {
    return expose(async () => {
      const parsed = submitBuiltInCheckoutInput(input);
      const operationFingerprint = submissionFingerprint(parsed, "submit_builtin");
      return await this.executeSubmission(
        {
          text: `SELECT outcome, result_payload FROM saas.storefront_checkout_submit_builtin(
            $1::text,$2::text,$3::bigint,$4::uuid,$5::text,$6::text,$7::uuid,$8::timestamptz
          )`,
          values: [
            parsed.hostname,
            parsed.credentialDigest,
            parsed.submission.cartVersion,
            parsed.submission.operationId,
            operationFingerprint,
            digest(parsed.submission.checkoutNonce),
            parsed.submission.paymentMethodId,
            parsed.now,
          ],
        },
        safeSubmission,
        new Set(["placed", "operation_replayed"]),
        Object.freeze({
          hostname: parsed.hostname,
          credentialDigest: parsed.credentialDigest,
          operationId: parsed.submission.operationId,
          fingerprint: operationFingerprint,
          expected: Object.freeze({ kind: "built_in" as const }),
          now: parsed.now,
        }),
      );
    });
  }

  beginHosted(input: BeginHostedCheckoutInput): Promise<HostedCheckoutAuthority> {
    return expose(async () => {
      const parsed = beginHostedCheckoutInput(input);
      const operationFingerprint = submissionFingerprint(parsed, "begin_hosted", parsed);
      const parseAuthority = (value: unknown) => safeHostedAuthority(value, parsed);
      return await this.executeSubmission(
        {
          text: `SELECT outcome, result_payload FROM saas.storefront_checkout_begin_hosted(
            $1::text,$2::text,$3::bigint,$4::uuid,$5::text,$6::text,$7::uuid,$8::text,
            $9::uuid,$10::text,$11::timestamptz
          )`,
          values: [
            parsed.hostname,
            parsed.credentialDigest,
            parsed.submission.cartVersion,
            parsed.submission.operationId,
            operationFingerprint,
            digest(parsed.submission.checkoutNonce),
            parsed.submission.paymentMethodId,
            parsed.submission.identityNumber,
            parsed.attemptId,
            parsed.callbackBindingDigest,
            parsed.now,
          ],
        },
        parseAuthority,
        new Set(["created", "operation_replayed"]),
        Object.freeze({
          hostname: parsed.hostname,
          credentialDigest: parsed.credentialDigest,
          operationId: parsed.submission.operationId,
          fingerprint: operationFingerprint,
          expected: Object.freeze({
            kind: "hosted" as const,
            submission: parsed.submission,
            attemptId: parsed.attemptId,
            callbackBindingDigest: parsed.callbackBindingDigest,
          }),
          now: parsed.now,
        }),
      );
    });
  }

  getStatus(input: GetCheckoutStatusInput): Promise<CheckoutStatus> {
    return expose(async () => {
      const parsed = getCheckoutStatusInput(input);
      const selected = await this.read({
        text: `SELECT outcome, result_payload FROM saas.storefront_checkout_get_status(
          $1::text,$2::text,$3::timestamptz
        )`,
        values: [parsed.hostname, parsed.credentialDigest, parsed.now],
      });
      if (selected.outcome !== "found") {
        throwOutcome(selected.outcome, selected.resultPayload);
      }
      return safeStatus(selected.resultPayload);
    });
  }

  getPolicy(input: GetCheckoutPolicyInput): Promise<CheckoutPolicy> {
    return expose(async () => {
      const parsed = getCheckoutPolicyInput(input);
      const selected = await this.read({
        text: `SELECT outcome, result_payload FROM saas.storefront_checkout_get_policy(
          $1::text,$2::text,$3::timestamptz
        )`,
        values: [parsed.hostname, parsed.policyType, parsed.now],
      });
      if (selected.outcome !== "found") {
        throwOutcome(selected.outcome, selected.resultPayload);
      }
      return safePolicy(selected.resultPayload);
    });
  }

  recover(input: RecoverCheckoutOperationInput): Promise<CheckoutOperationRecovery> {
    return expose(async () => {
      const parsed = recoverCheckoutOperationInput(input);
      const selected = await this.read({
        text: `SELECT outcome, result_payload FROM saas.storefront_checkout_recover_operation(
          $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz
        )`,
        values: [
          parsed.hostname,
          parsed.credentialDigest,
          parsed.operationId,
          parsed.fingerprint,
          parsed.now,
        ],
      });
      if (selected.outcome !== "operation_replayed") {
        throwOutcome(selected.outcome, selected.resultPayload);
      }
      if (parsed.expected.kind === "delivery") {
        return Object.freeze({
          kind: "delivery" as const,
          quote: safeQuote(selected.resultPayload, parsed.expected.checkoutNonce),
        });
      }
      if (parsed.expected.kind === "built_in") {
        return Object.freeze({
          kind: "built_in" as const,
          submission: safeSubmission(selected.resultPayload),
        });
      }
      const hostedExpected: BeginHostedCheckoutInput = Object.freeze({
        hostname: parsed.hostname,
        credentialDigest: parsed.credentialDigest,
        now: parsed.now,
        submission: parsed.expected.submission,
        attemptId: parsed.expected.attemptId,
        callbackBindingDigest: parsed.expected.callbackBindingDigest,
      });
      return Object.freeze({
        kind: "hosted" as const,
        authority: safeHostedAuthority(selected.resultPayload, hostedExpected),
      });
    });
  }
}
