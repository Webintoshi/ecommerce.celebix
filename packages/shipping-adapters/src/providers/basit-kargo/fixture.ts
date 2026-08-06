import type { CreateProviderShipmentInput } from "../../contracts.ts";
import type {
  ShippingProviderTransport,
  ShippingProviderTransportRequest,
  ShippingProviderTransportResult,
} from "../../transport.ts";
import type { BasitKargoCredential } from "./types.ts";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export type BasitKargoFixtureStep =
  | Readonly<{ kind: "json"; status: number; body: unknown; retryAfterSeconds?: number | null }>
  | Readonly<{ kind: "svg"; status: number; body: string }>
  | Readonly<{ kind: "failure"; code: Extract<ShippingProviderTransportResult, { kind: "failure" }>["code"] }>
  | Readonly<{ kind: "unknown" }>;

export type BasitKargoFixtureCall = Readonly<{
  method: ShippingProviderTransportRequest["method"];
  path: string;
  body?: unknown;
}>;

export interface BasitKargoFixtureTransport extends ShippingProviderTransport {
  readonly calls: readonly BasitKargoFixtureCall[];
}

export function createBasitKargoFixtureTransport(steps: readonly BasitKargoFixtureStep[]): BasitKargoFixtureTransport {
  const queue = [...steps];
  const calls: BasitKargoFixtureCall[] = [];
  return {
    calls,
    async request(input): Promise<ShippingProviderTransportResult> {
      calls.push(Object.freeze({
        method: input.method,
        path: input.path,
        ...(input.body === undefined ? {} : { body: JSON.parse(DECODER.decode(input.body)) as unknown }),
      }));
      const step = queue.shift();
      if (step === undefined) throw new Error("basit_kargo_fixture_exhausted");
      if (step.kind === "unknown") return Object.freeze({ kind: "failure", code: "network" });
      if (step.kind === "failure") return Object.freeze({ kind: "failure", code: step.code });
      if (step.kind === "svg") return Object.freeze({
        kind: "response", status: step.status, contentType: "image/svg+xml", body: ENCODER.encode(step.body), retryAfterSeconds: null,
      });
      return Object.freeze({
        kind: "response", status: step.status, contentType: "application/json", body: ENCODER.encode(JSON.stringify(step.body)),
        retryAfterSeconds: step.retryAfterSeconds ?? null,
      });
    },
  };
}

export const BASIT_KARGO_CREATE_FIXTURE: CreateProviderShipmentInput<BasitKargoCredential> = Object.freeze({
  credential: Object.freeze({ token: "bk_test_token_1234" }),
  reference: "MAN-1001",
  handlerCode: "ARAS",
  direction: "outgoing",
  brandId: "brand-1",
  addressId: "address-1",
  recipient: Object.freeze({
    name: "Test Müşteri",
    phone: "5551234567",
    city: "İstanbul",
    town: "Kadıköy",
    address: "Koşuyolu",
  }),
  items: Object.freeze([Object.freeze({ reference: "line-1", name: "Altın Yüzük", quantity: 1 })]),
  packages: Object.freeze([Object.freeze({ heightCm: 10, widthCm: 15, depthCm: 5, weightKg: 1.25 })]),
  codAmountCents: 10_000,
  codPaymentType: "cash",
  signal: new AbortController().signal,
});
