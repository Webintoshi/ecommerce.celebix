export async function POST() {
  return Response.json(
    { code: "unauthenticated" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}
