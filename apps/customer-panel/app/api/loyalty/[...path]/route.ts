import {handleDefaultLoyaltyRequest} from '../../../../lib/loyalty-http/default.ts';
import {preparePromotionRouteRequest} from '../../../../lib/promotions-http/request-authority.ts';
const handle=(request:Request)=>handleDefaultLoyaltyRequest(preparePromotionRouteRequest(request));
export const GET=handle;
export const POST=handle;
