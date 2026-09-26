import { barcodeListResponse, rejectBarcodeFixtureMutation } from "../../../../barcode-studio/fixture-data";

export function GET(request: Request) {
  try {
    return Response.json(barcodeListResponse(request), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ code: "invalid_input" }, { status: 400 });
  }
}

export const POST = rejectBarcodeFixtureMutation;
export const PATCH = rejectBarcodeFixtureMutation;
export const DELETE = rejectBarcodeFixtureMutation;
