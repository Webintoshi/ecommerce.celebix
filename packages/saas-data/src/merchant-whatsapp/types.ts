import type {PostgresPoolLike,PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {MerchantWhatsAppCommand,MerchantWhatsAppResult} from '../../../saas-contracts/src/merchant-whatsapp/types.ts';
export type PostgresMerchantWhatsAppOptions=Readonly<{pool:PostgresPoolLike;role:'celebix_saas_identity';timeouts:PostgresTimeoutOptions}>;
export interface MerchantWhatsAppRepository{command(command:MerchantWhatsAppCommand):Promise<MerchantWhatsAppResult>}
