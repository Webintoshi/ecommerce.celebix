import type {PostgresPoolLike,PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {AdminLoginSecurityCommand,AdminLoginSecurityResult} from '../../../saas-contracts/src/admin-login-security/types.ts';
export type PostgresAdminLoginSecurityOptions=Readonly<{pool:PostgresPoolLike;role:'celebix_saas_identity';timeouts:PostgresTimeoutOptions}>;
export interface AdminLoginSecurityRepository{command(command:AdminLoginSecurityCommand):Promise<AdminLoginSecurityResult>}
