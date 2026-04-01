import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.startsWith("sb-")) {
      continue;
    }

    cookieStore.set(cookie.name, "", {
      expires: new Date(0),
      path: "/",
    });
  }

  return NextResponse.json({ success: true });
}
