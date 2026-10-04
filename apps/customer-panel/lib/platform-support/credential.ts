import 'server-only';
import {createHmac} from 'node:crypto';
export function supportRedemptionCredential(handoff:string,hostname:string,browserBinding:string,key=process.env.CELEBIX_PLATFORM_HANDOFF_KEY_B64URL):string{
 if(!/^[a-f0-9]{64}$/.test(handoff)||!/^[a-f0-9]{64}$/.test(browserBinding)||!key||!/^[A-Za-z0-9_-]{43}$/.test(key))throw Error('support_unavailable');
 const secret=Buffer.from(key,'base64url');if(secret.length!==32||secret.toString('base64url')!==key)throw Error('support_unavailable');
 return createHmac('sha256',secret).update(JSON.stringify({schemaVersion:1,purpose:'celebix-support-redemption',handoff,hostname,browserBinding})).digest('hex');
}
