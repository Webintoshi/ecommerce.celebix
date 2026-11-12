import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { isMutationMethod, validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { legacyAdminRoleAllowed, type LegacyAdminApiScope } from "@/lib/legacy-admin-api-policy";

function deny(status: 401 | 403, error: string) {
    return NextResponse.json({ success: false, error }, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

export async function requireLegacyAdminApi(request: Request, scope: LegacyAdminApiScope = "admin") {
    const nextRequest = request instanceof NextRequest ? request : new NextRequest(request);
    if (isMutationMethod(request.method) && !validateSameOriginRequest(nextRequest).allowed) {
        return deny(403, "İstek kaynağı doğrulanamadı.");
    }

    const auth = await getAdminAuthContext();
    if (!auth) return deny(401, "Yetkisiz erişim.");
    return legacyAdminRoleAllowed(auth.profile.role, scope) ? null : deny(403, "İşlem için yetkiniz yok.");
}
