import { parseBarcodeInternalReservationResult } from "@celebix/saas-contracts";
import { idempotentJsonMutation } from "./idempotent-mutation.ts";

export async function reserveInternalBarcode(fetcher: typeof fetch = fetch): Promise<string> {
  const result = await idempotentJsonMutation(
    "/api/catalog/barcodes/internal/ean13/reservations", "POST", {},
    {
      fetcher,
      parse: parseBarcodeInternalReservationResult,
      headers: { "x-celebix-internal-barcode-format": "ean13" },
    },
  );
  return result.barcode;
}
