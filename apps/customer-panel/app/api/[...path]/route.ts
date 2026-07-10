function deny() {
  return Response.json(
    { code: "unauthenticated" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export const GET = deny;
export const POST = deny;
export const PUT = deny;
export const PATCH = deny;
export const DELETE = deny;
