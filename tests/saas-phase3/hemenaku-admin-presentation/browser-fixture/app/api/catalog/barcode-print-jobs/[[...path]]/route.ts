import { BARCODE_PRINT_JOBS, BARCODE_PRINT_JOB_SUMMARIES, rejectBarcodeFixtureMutation } from "../../../../barcode-studio/fixture-data";

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = (await context.params).path ?? [];
  if (path.length === 0) return Response.json({ items: BARCODE_PRINT_JOB_SUMMARIES }, { headers: { "Cache-Control": "no-store" } });
  if (path.length === 2 && path[0] === "v2") {
    const job = BARCODE_PRINT_JOBS.find((item) => item.id === path[1]);
    return job ? Response.json(job, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ code: "not_found" }, { status: 404 });
  }
  // Browser/PDF/ZPL outputs and all job creation are intentionally unavailable.
  return Response.json({ code: "fixture_output_disabled" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export const POST = rejectBarcodeFixtureMutation;
export const PATCH = rejectBarcodeFixtureMutation;
export const DELETE = rejectBarcodeFixtureMutation;
