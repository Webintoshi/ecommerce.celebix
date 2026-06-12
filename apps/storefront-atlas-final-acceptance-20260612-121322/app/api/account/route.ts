import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}
