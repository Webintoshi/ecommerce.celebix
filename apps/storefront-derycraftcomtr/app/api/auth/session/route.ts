import { NextRequest, NextResponse } from "next/server";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  getLogtoCustomerAccountSnapshot,
  resolveLogtoCustomerSessionIdentity,
} from "@/lib/logto-customer-auth";

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.json({ user: null, authSource: "disabled" });
  }

  const identity = resolveLogtoCustomerSessionIdentity(request.cookies.getAll());

  if (!identity) {
    return NextResponse.json({ user: null, authSource: "logto" }, { status: 200 });
  }

  const snapshot = await getLogtoCustomerAccountSnapshot(identity.session.subject);
  if (!snapshot) {
    return NextResponse.json({ user: null, authSource: "logto" }, { status: 401 });
  }

  return NextResponse.json({
    user: identity.user,
    authSource: "logto",
    customer: snapshot.customer,
  });
}
