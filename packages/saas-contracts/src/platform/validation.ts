import {PLATFORM_ACTIONS,type PlatformMutation} from './types.ts';
export class PlatformValidationError extends Error {constructor(){super('Bilgileri kontrol edip yeniden deneyin.');this.name='PlatformValidationError';}}
export function parsePlatformMutation(body:unknown,key:string|null):PlatformMutation {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new PlatformValidationError();
 const r=body as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['action','payload','expectedVersion'].includes(k)) || !PLATFORM_ACTIONS.includes(r.action as never) || !Number.isSafeInteger(r.expectedVersion)||Number(r.expectedVersion)<0 || !r.payload||typeof r.payload!=='object'||Array.isArray(r.payload))throw new PlatformValidationError();
 if(!key||!/^[A-Za-z0-9._:-]{8,128}$/.test(key)||JSON.stringify(r.payload).length>64_000)throw new PlatformValidationError();
 return {action:r.action as PlatformMutation['action'],payload:r.payload as Record<string,unknown>,expectedVersion:Number(r.expectedVersion),idempotencyKey:key};
}
