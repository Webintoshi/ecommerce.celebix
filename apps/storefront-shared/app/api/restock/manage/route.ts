import {resolveDefaultPublicStorefrontRuntime} from '@/lib/default-runtime.ts';
import {selectTrustedStorefrontHostAuthority} from '@/lib/trusted-host-authority.ts';
import {createRestockManageRoute} from '@/lib/restock/routes.ts';
export const POST=createRestockManageRoute({selectAuthority:headers=>selectTrustedStorefrontHostAuthority(headers),resolveRepository:async()=>(await resolveDefaultPublicStorefrontRuntime())?.restockAlerts??null,now:()=>new Date()});
