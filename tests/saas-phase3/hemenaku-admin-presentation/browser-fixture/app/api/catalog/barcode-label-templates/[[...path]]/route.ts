import { BARCODE_TEMPLATES, rejectBarcodeFixtureMutation } from "../../../../barcode-studio/fixture-data";

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = (await context.params).path ?? [];
  if (path.length > 0) return Response.json({ code: "fixture_mutation_disabled" }, { status: 403 });
  return Response.json({ items: BARCODE_TEMPLATES }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = rejectBarcodeFixtureMutation;
export const PATCH = rejectBarcodeFixtureMutation;
export const DELETE = rejectBarcodeFixtureMutation;
