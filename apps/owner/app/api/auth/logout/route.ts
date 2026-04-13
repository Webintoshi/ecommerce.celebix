import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { applyOwnerSiteDataReset, expireOwnerAuthCookies } from "@/lib/owner-auth-cookies";
import { getOwnerSupabaseAnonKey, getOwnerSupabaseUrl } from "@/lib/owner-supabase-shared";

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function createOwnerRouteClient(
  requestCookies: Awaited<ReturnType<typeof cookies>>,
  cookieMutations: PendingCookie[],
) {
  return createServerClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return requestCookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          const { name, value, ...options } = cookie;
          cookieMutations.push({
            name,
            value,
            options,
          });
        }
      },
    },
  });
}

export async function POST() {
  try {
    const requestCookies = await cookies();
    const cookieMutations: PendingCookie[] = [];
    const existingAuthCookies = requestCookies.getAll();
    const client = createOwnerRouteClient(requestCookies, cookieMutations);

    await client.auth.signOut({ scope: "local" });

    const response = NextResponse.json({ success: true }, { status: 200 });

    expireOwnerAuthCookies(response, existingAuthCookies);

    for (const cookie of cookieMutations) {
      response.cookies.set(cookie.name, cookie.value, cookie.options as never);
    }

    return applyOwnerSiteDataReset(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cikis yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
