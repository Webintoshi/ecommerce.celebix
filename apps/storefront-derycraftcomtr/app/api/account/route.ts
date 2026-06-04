import { NextRequest, NextResponse } from "next/server";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  getLogtoCustomerAccountSnapshot,
  readLogtoCustomerSessionUser,
  resolveLogtoCustomerSessionIdentity,
} from "@/lib/logto-customer-auth";

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.json({ error: "customer_auth_disabled" }, { status: 503 });
  }

  const identity = resolveLogtoCustomerSessionIdentity(request.cookies.getAll());
  if (!identity) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const snapshot = await getLogtoCustomerAccountSnapshot(identity.session.subject);
  if (!snapshot) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    user: readLogtoCustomerSessionUser(request.cookies.getAll()),
    authSource: "logto",
    customer: snapshot.customer,
    orders: snapshot.customer.orders ?? [],
  });
}
