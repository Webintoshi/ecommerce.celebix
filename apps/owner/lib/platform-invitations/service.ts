import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {OidcProviderPort} from '../self-serve-oidc.ts';
import type {AuthenticatedPayloadCipher,EncryptedPayload} from '../saas-persistence/identity-crypto.ts';
import type {InvitationBootstrap} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
export type InvitationRepository={execute(name:'start'|'claim'|'complete',values:unknown[]):Promise<Record<string,unknown>>};
function invalid():never{throw new Error('invitation_denied');}
const hash=(value:string)=>createHash('sha256').update(`celebix-platform-invitation-v1\n${value}`).digest('hex');
export function createInvitationService(_input:{repository:InvitationRepository;provider:OidcProviderPort;cipher:AuthenticatedPayloadCipher;issuer:string;audience:string;callbackUrl:string;clock():Date;seal(payload:InvitationBootstrap):string}){
 return {async start(_token:string,_adminHost:string):Promise<never>{throw new Error('invitations_retired');},async complete(_state:string,_code:string,_binding:string):Promise<never>{throw new Error('invitations_retired');}};
}
