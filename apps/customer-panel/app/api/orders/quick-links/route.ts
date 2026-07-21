import {
  handleDefaultQuickLinkCreate,
  handleDefaultQuickLinkList,
} from "../../../../lib/quick-link-http/default.ts";

export const GET = handleDefaultQuickLinkList;
export const POST = handleDefaultQuickLinkCreate;
