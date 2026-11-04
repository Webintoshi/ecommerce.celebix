import 'server-only';
import {resolveDefaultPublicStorefrontRuntime} from '../default-runtime.ts';
import {selectTrustedStorefrontHostAuthority} from '../trusted-host-authority.ts';
import {createAccountLoyaltyRoutes} from './loyalty-route.ts';
const routes=createAccountLoyaltyRoutes({selectAuthority:selectTrustedStorefrontHostAuthority,resolveRuntime:async()=>(await resolveDefaultPublicStorefrontRuntime())?.loyalty??null});
export const handleAccountLoyaltyRead=routes.GET;
export const handleAccountLoyaltyMutation=routes.POST;
