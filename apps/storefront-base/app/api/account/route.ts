import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "unauthenticated",
      code: "pending_auth_setup",
    },
    { status: 401 },
  );
}
