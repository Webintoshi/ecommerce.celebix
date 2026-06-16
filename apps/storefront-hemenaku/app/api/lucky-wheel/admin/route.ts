import { NextResponse } from "next/server";

const REMOVED_MESSAGE = "Lucky Wheel is not available for this store.";

export async function GET() {
  return NextResponse.json({ success: false, error: REMOVED_MESSAGE }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ success: false, error: REMOVED_MESSAGE }, { status: 404 });
}
