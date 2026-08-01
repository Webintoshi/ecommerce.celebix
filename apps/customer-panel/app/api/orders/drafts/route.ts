import {
  handleDefaultOrderDraftCreate,
  handleDefaultOrderDraftList,
} from "../../../../lib/order-http/default.ts";

export const GET = handleDefaultOrderDraftList;
export const POST = handleDefaultOrderDraftCreate;
