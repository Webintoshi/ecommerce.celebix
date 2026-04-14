import { NextRequest, NextResponse } from "next/server";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { getOrderRedirectUrl } from "@/lib/payment-runtime";

function getBaseUrl(request: NextRequest) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
    const orderId = request.nextUrl.searchParams.get("orderId");
    const requestedStatus = request.nextUrl.searchParams.get("status");
    const status = requestedStatus === "success" || requestedStatus === "pending" ? requestedStatus : "failed";

    if (!orderId) {
        return NextResponse.redirect(`${getBaseUrl(request)}/odeme`, 302);
    }

    if (status === "failed") {
        await updatePaymentStatus(orderId, "failed");
        await updateOrderStatus(orderId, "cancelled");
    }

    return NextResponse.redirect(getOrderRedirectUrl(getBaseUrl(request), orderId, status), 302);
}
