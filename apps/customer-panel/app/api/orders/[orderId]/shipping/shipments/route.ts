import { handleShippingShipment, handleShippingShipmentForOrder } from "../../../../../../lib/shipping-http/default.ts";

export const GET = handleShippingShipmentForOrder;
export const POST = handleShippingShipment;
