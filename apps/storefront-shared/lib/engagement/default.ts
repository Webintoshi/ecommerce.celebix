import 'server-only';
import { resolveDefaultPublicStorefrontRuntime } from '../default-runtime.ts';
import { selectTrustedStorefrontHostAuthority } from '../trusted-host-authority.ts';
import { createStoreEngagementRoutes } from './route.ts';
import { createContactRequestLimiter } from './rate-limit.ts';
export const storeEngagementRoutes=createStoreEngagementRoutes({selectAuthority:selectTrustedStorefrontHostAuthority,resolveRuntime:async()=>(await resolveDefaultPublicStorefrontRuntime())?.engagement??null,allowCapture:createContactRequestLimiter()});
