import { NextResponse } from "next/server";
import { buildSelfServeOwnerPublicUrl } from "@/lib/self-serve-logto";

export async function GET(request: Request) {
  const url = buildSelfServeOwnerPublicUrl(request, "/kayit");
  url.searchParams.set("auth", "disabled");
  return NextResponse.redirect(url, 303);
}
