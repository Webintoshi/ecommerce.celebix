import { parseBarcodeInternalReservationResult } from "@celebix/saas-contracts";
import { idempotentJsonMutation } from "./idempotent-mutation.ts";

export async function reserveInternalBarcode(fetcher: typeof fetch = fetch): Promise<string> {
  const result = await idempotentJsonMutation(
    "/api/catalog/barcodes/internal/reservations", "POST", {},
    { fetcher, parse: parseBarcodeInternalReservationResult },
  );
  return result.barcode;
}
