import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/permissions";
import { getAdminAuthContext, type AdminAuthContext } from "@/lib/admin-auth";

type RequireAdminApiAuthOptions = {
  roles?: UserRole[];
};

type RequireAdminApiAuthResult = {
  auth: AdminAuthContext | null;
  response: NextResponse | null;
};

export async function requireAdminApiAuth(
  options: RequireAdminApiAuthOptions = {},
): Promise<RequireAdminApiAuthResult> {
  const auth = await getAdminAuthContext();

  if (!auth) {
    return {
      auth: null,
      response: NextResponse.json({ success: false, error: "Yetkisiz erisim." }, { status: 401 }),
    };
  }

  if (options.roles?.length && !options.roles.includes(auth.profile.role)) {
    return {
      auth: null,
      response: NextResponse.json({ success: false, error: "Bu islem icin yetkiniz yok." }, { status: 403 }),
    };
  }

  return {
    auth,
    response: null,
  };
}
