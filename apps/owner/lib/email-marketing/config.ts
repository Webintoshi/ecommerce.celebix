import { isIP } from 'node:net';
import { parseMerchantProviderCredentialKeyring, type MerchantProviderCredentialKeyring, type EmailMarketingWorkerMode } from '@celebix/saas-data';
type Environment = Readonly<Record<string, string | undefined>>;
export interface EmailMarketingWorkerConfig {
    readonly database: Readonly<{
        url: string;
        name: string;
    }>;
    readonly workerId: string;
    readonly mode: EmailMarketingWorkerMode;
    readonly keyring: MerchantProviderCredentialKeyring;
}
function invalid(): never { throw new Error('email_marketing_config_invalid'); }
export function resolveEmailMarketingWorkerMode(env: Environment): EmailMarketingWorkerMode { const mode = env.CELEBIX_EMAIL_MARKETING_WORKER_MODE ?? 'off'; return mode === 'off' || mode === 'revoke_only' || mode === 'full' ? mode : invalid(); }
function privateHost(host: string) { const kind = isIP(host); if (kind === 0)
    return !host.includes('.') || host.endsWith('.internal') || host.endsWith('.local'); if (kind === 6)
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd'); const [first, second] = host.split('.').map(Number); return first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second !== undefined && second >= 16 && second <= 31 || first === 192 && second === 168; }
export function parseEmailMarketingWorkerConfig(env: Environment): EmailMarketingWorkerConfig { const mode = resolveEmailMarketingWorkerMode(env); if (mode === 'off')
    invalid(); const url = env.CELEBIX_SAAS_DATABASE_URL, workerId = env.CELEBIX_EMAIL_MARKETING_WORKER_ID; if (!url || url.length > 4096 || url !== url.trim() || /[\x00-\x20\x7f]/.test(url) || !workerId || !/^[A-Za-z0-9._-]{1,128}$/.test(workerId))
    invalid(); let u: URL; try {
    u = new URL(url);
}
catch {
    return invalid();
} const name = decodeURIComponent(u.pathname.slice(1)); if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.username || !u.password || !privateHost(u.hostname) || u.hash || u.searchParams.size !== 1 || u.searchParams.get('sslmode') !== 'verify-full' || !name || !/^[a-z][a-z0-9_]{2,62}$/.test(name) || u.pathname !== `/${name}` || u.toString() !== url)
    invalid(); return Object.freeze({ mode, workerId, database: Object.freeze({ url, name }), keyring: parseMerchantProviderCredentialKeyring(env) }); }
