import {createInvitationInternalHandler} from '../../../../lib/platform-invitations/http.ts';
import {invitationRuntime} from '../../../../lib/platform-invitations/runtime.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=createInvitationInternalHandler(invitationRuntime);
