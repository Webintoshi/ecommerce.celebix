import { handleInvitationManagement } from "@/lib/store-admin-invitations/management-default";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handleInvitationManagement(request, "list"); }
