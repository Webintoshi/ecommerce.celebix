export type BarcodeValidation = Readonly<{
  valid: boolean;
  code?:
    "barcode_missing" | "code128_invalid" | "ean13_length" | "ean13_checksum";
}>;

export function validateEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const expected =
    (10 -
      (digits
        .slice(0, 12)
        .reduce(
          (sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3),
          0,
        ) %
        10)) %
    10;
  return expected === digits[12];
}

export function validateBarcodeValue(
  format: "code128" | "ean13",
  value: string | undefined,
): BarcodeValidation {
  if (value === undefined || value === "")
    return Object.freeze({ valid: false, code: "barcode_missing" });
  if (format === "code128") {
    return /^[A-Za-z0-9 ._\/-]{1,80}$/.test(value)
      ? Object.freeze({ valid: true })
      : Object.freeze({ valid: false, code: "code128_invalid" });
  }
  if (!/^\d{13}$/.test(value))
    return Object.freeze({ valid: false, code: "ean13_length" });
  return validateEan13(value)
    ? Object.freeze({ valid: true })
    : Object.freeze({ valid: false, code: "ean13_checksum" });
}

export function barcodeFitsLabel(
  input: Readonly<{
    format: "code128" | "ean13";
    value: string;
    availableWidthMm: number;
    minimumModuleMm?: number;
  }>,
): boolean {
  if (!Number.isFinite(input.availableWidthMm) || input.availableWidthMm <= 0)
    return false;
  if (!validateBarcodeValue(input.format, input.value).valid) return false;
  const modules = barcodeModuleCount(input.format, input.value);
  const moduleMm =
    input.minimumModuleMm ?? (input.format === "ean13" ? 0.264 : 0.19);
  return (
    Number.isFinite(moduleMm) &&
    moduleMm > 0 &&
    modules * moduleMm <= input.availableWidthMm
  );
}

export function barcodeModuleCount(
  format: "code128" | "ean13",
  value: string,
): number {
  if (format === "ean13") return 117;
  let dataCodewords = 0;
  for (let index = 0; index < value.length; ) {
    const run = value.slice(index).match(/^\d+/)?.[0].length ?? 0;
    if (run >= 4) {
      const paired = run - (run % 2);
      if (run % 2) {
        dataCodewords += 1;
        index += 1;
      }
      dataCodewords += 1 + paired / 2;
      index += paired;
      if (index < value.length) dataCodewords += 1;
      continue;
    }
    dataCodewords += 1;
    index += 1;
  }
  return 55 + dataCodewords * 11;
}

export function minimumBarcodeModuleMm(
  format: "code128" | "ean13",
  profile: "a4" | "thermal" | "zebra-203" | "zebra-300",
): number {
  if (profile === "zebra-203")
    return ((format === "ean13" ? 3 : 2) * 25.4) / 203;
  if (profile === "zebra-300")
    return ((format === "ean13" ? 4 : 3) * 25.4) / 300;
  return format === "ean13" ? 0.264 : 0.19;
}
