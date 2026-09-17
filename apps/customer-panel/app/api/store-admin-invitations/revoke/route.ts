import { handleInvitationManagement } from "@/lib/store-admin-invitations/management-default";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return handleInvitationManagement(request, "revoke"); }
