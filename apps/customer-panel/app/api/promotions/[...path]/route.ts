import { handleDefaultPromotionsRequest } from "../../../../lib/promotions-http/default.ts";
import { preparePromotionRouteRequest } from "../../../../lib/promotions-http/request-authority.ts";

function handle(request: Request) {
  return handleDefaultPromotionsRequest(preparePromotionRouteRequest(request));
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
