import type { PromotionBatchCreateRequest } from "@celebix/saas-contracts";

type PromotionBatchFormInput = Readonly<{
  count: string;
  prefix: string;
  codeLength: string;
  perCustomerUsage: string;
  expiresAt: string | null;
}>;

export const defaultPromotionBatchForm: Readonly<Omit<PromotionBatchFormInput, "expiresAt">> = Object.freeze({
  count: "100",
  prefix: "VIP_",
  codeLength: "24",
  perCustomerUsage: "1",
});

type PromotionBatchPreparation =
  | Readonly<{ kind: "valid"; value: PromotionBatchCreateRequest }>
  | Readonly<{ kind: "invalid"; message: string }>;

function integer(value: string, minimum: number, maximum: number): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function preparePromotionBatchCreate(input: PromotionBatchFormInput): PromotionBatchPreparation {
  const count = integer(input.count, 1, 10_000);
  if (count === null) return Object.freeze({ kind: "invalid", message: "Kupon adedi 1 ile 10.000 arasında olmalı." });
  if (!/^(|[A-Z0-9][A-Z0-9_-]{0,19})$/.test(input.prefix)) return Object.freeze({ kind: "invalid", message: "Önek en fazla 20 karakter olmalı; yalnız büyük harf, sayı, alt çizgi ve tire kullanılabilir." });
  const codeLength = integer(input.codeLength, 16, 64);
  if (codeLength === null) return Object.freeze({ kind: "invalid", message: "Toplam kod uzunluğu 16 ile 64 arasında olmalı." });
  if (codeLength - input.prefix.length < 16) return Object.freeze({ kind: "invalid", message: "Toplam kod uzunluğu, önekten sonra en az 16 rastgele karakter bırakmalı." });
  const perCustomerUsage = integer(input.perCustomerUsage, 1, 1_000_000);
  if (perCustomerUsage === null) return Object.freeze({ kind: "invalid", message: "Müşteri başı kullanım 1 ile 1.000.000 arasında olmalı." });
  return Object.freeze({ kind: "valid", value: Object.freeze({ count, prefix: input.prefix, codeLength, perCustomerUsage, expiresAt: input.expiresAt }) });
}
