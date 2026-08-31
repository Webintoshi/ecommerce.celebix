export async function POST() {
  return Response.json(
    { code: "not_found" },
    { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
