import { handleInventoryRequest } from "../../../../lib/inventory-http/default.ts";
import { prepareInventoryRouteRequest } from "../../../../lib/inventory-http/request-authority.ts";

function handle(request: Request) {
  return handleInventoryRequest(prepareInventoryRouteRequest(request));
}

export const GET = handle;
export const POST = handle;
