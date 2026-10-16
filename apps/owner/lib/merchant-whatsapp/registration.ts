import {registrationRecovery} from './registration-recovery.ts';
import type {CreatePhoneStarterTenantInput, CreateStarterTenantResult, SaaSContractError} from '../../../../packages/saas-contracts/src/index.ts';
import type {MerchantPhonePending} from './codec.ts';
import type {MerchantCompletion, MerchantInternalResult, createOwnerMerchantWhatsAppService} from './service.ts';
import {isMerchantInternalListener} from '../../../customer-panel/lib/merchant-phone/handler.ts';

export type MerchantSignupProof = NonNullable<Awaited<ReturnType<ReturnType<typeof createOwnerMerchantWhatsAppService>['getSignupProof']>>>;
export type MerchantPhoneRegistrationDependencies = Readonly<{
  ownerOrigin: string;
  clock: () => Date;
  /** Reads authenticated, browser-bound cookies; revalidates native pending authority on every request. */
  getSignupProof: (request: Request) => Promise<MerchantSignupProof | null>;
  starterTenant: {execute(input: CreatePhoneStarterTenantInput): Promise<
    {ok: true; value: CreateStarterTenantResult} | {ok: false; error: SaaSContractError}
  >};
  claimSignup: (input: Readonly<{pending: MerchantPhonePending; storeId: string; operationId: string}>) => Promise<MerchantInternalResult>;
  /** Transfers the existing native session through the registered cross-host handoff. Never issues a second session. */
  complete: (input: Readonly<{request: Request; completion: MerchantCompletion; operationId: string}>) => Promise<Response>;
}>;
const PATH = '/api/self-serve/register';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const LIMIT = 8192;
class InvalidForm extends Error {}
function invalid(): never {throw new InvalidForm();}
function exactOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.port || url.username || url.password) invalid();
  return url.origin;
}
function secure(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  if (!response.headers.has('referrer-policy')) response.headers.set('referrer-policy', 'no-referrer');
  return response;
}
function failure(code: string, status: number,request:Request,fields?:Readonly<Record<string,string>>,editSlug=false): Response {return secure(request.headers.get('accept')?.includes('text/html') ? registrationRecovery(code,status,fields,editSlug) : Response.json({code}, {status}));}
async function form(request: Request) {
  if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) invalid();
  const length = request.headers.get('content-length');
  if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > LIMIT)) invalid();
  const reader = request.body?.getReader();
  if (!reader) invalid();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > LIMIT) {await reader.cancel(); invalid();}
      chunks.push(item.value);
    }
  } finally {reader.releaseLock();}
  if (length !== null && Number(length) !== size) invalid();
  let raw: string;
  try {raw = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));} catch {return invalid();}
  if (/%(?![a-f0-9]{2})/iu.test(raw)) invalid();
  const body = new URLSearchParams(raw);
  const allowed = ['firstName', 'lastName', 'storeName', 'storeSlug', 'privacyConsent', 'marketingConsent', 'operationId', 'contactEmail'];
  for (const key of body.keys()) if (!allowed.includes(key) || body.getAll(key).length !== 1) invalid();
  const firstName=(body.get('firstName') ?? '').trim(), lastName=(body.get('lastName') ?? '').trim();
  if (![firstName,lastName].every(name=>name.length>=1 && name.length<=100 && !/[\u0000-\u001f\u007f]/u.test(name))) invalid();
  const name = (body.get('storeName') ?? '').trim();
  const slug = body.get('storeSlug') ?? '';
  const operationId = body.get('operationId') ?? '';
  const privacy = body.get('privacyConsent');
  const marketing = body.get('marketingConsent');
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/u.test(name) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length < 3 || slug.length > 48 || !UUID.test(operationId)) invalid();
  if (!['on', 'true'].includes(privacy ?? '') || (marketing !== null && !['on', 'true', 'false'].includes(marketing))) invalid();
  return {firstName,lastName,name, slug, operationId, marketing: marketing === 'on' || marketing === 'true', contactEmail: (body.get('contactEmail') ?? '').trim()};
}

export function createMerchantPhoneRegistrationHandler(options: MerchantPhoneRegistrationDependencies) {
  const ownerOrigin = exactOrigin(options.ownerOrigin), hostname = new URL(ownerOrigin).hostname;
  return async (request: Request): Promise<Response> => {
    let recoveryFields:Record<string,string>|undefined;
    const reject=(code:string,status:number,editSlug=false)=>failure(code,status,request,recoveryFields,editSlug);
    try {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== PATH || url.search || url.hash) return reject('invalid_input', 400);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.protocol === 'https:' && !isMerchantInternalListener(url) && url.origin !== ownerOrigin)) return reject('unauthorized', 403);
      // Next may construct request.url using its internal listener; the configured public origin is authoritative.
      if (request.headers.get('origin') !== ownerOrigin || request.headers.get('host') !== hostname || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')) return reject('unauthorized', 403);
      const input = await form(request);
      recoveryFields={firstName:input.firstName,lastName:input.lastName,storeName:input.name,storeSlug:input.slug,operationId:input.operationId,privacyConsent:'true',...(input.marketing?{marketingConsent:'true'}:{})};
      // Business contact settings are configured after registration, never treated as identity evidence.
      if (input.contactEmail) return reject('contact_email_unavailable', 503);
      const proof = await options.getSignupProof(request);
      const now = options.clock().getTime(), expires = proof ? Date.parse(proof.expiresAt) : NaN;
      if (!proof || proof.pending.purpose !== 'signup' || proof.pending.destinationHostname !== hostname || !UUID.test(proof.principalId) || !Number.isFinite(expires) || expires <= now || expires > now + 600000) return reject('fresh_login_required', 401);
      const timestamp = new Date(expires - 600000).toISOString();
      const tenant = await options.starterTenant.execute({
        schemaVersion: 1, idempotencyKey: input.operationId,
        principal: {kind: 'whatsapp', proof: proof.proof, profile:{firstName:input.firstName,lastName:input.lastName}},
        store: {name: input.name, slug: input.slug, locale: 'tr', currency: 'TRY', themeKey: 'starter'},
        consents: {privacyAcceptedAt: timestamp, ...(input.marketing ? {marketingAcceptedAt: timestamp} : {})},
        requestedAt: timestamp,
      });
      // An uncertain commit is recovered only by an explicit same-operation form retry.
      if (!tenant.ok) {
        const code = tenant.error.code;
        if (['invalid_input'].includes(code)) return reject('invalid_input', 400);
        if (['idempotency_mismatch', 'slug_taken', 'domain_conflict'].includes(code)) return reject('registration_conflict', 409,code==='slug_taken'||code==='domain_conflict');
        return reject('registration_unavailable', 503);
      }
      const result = tenant.value;
      if (!UUID.test(result.store.id) || result.store.slug !== input.slug || result.store.status !== 'active' || result.membership.principalId !== proof.principalId || result.membership.storeId !== result.store.id || result.membership.role !== 'store_owner' || result.membership.status !== 'active' || result.primaryDomain.storeId !== result.store.id) return reject('registration_unavailable', 503);
      const destination = exactOrigin(result.panelUrl);
      if (destination === ownerOrigin) return reject('registration_unavailable', 503);
      const claimed = await options.claimSignup({pending: proof.pending, storeId: result.store.id, operationId: input.operationId});
      const completion = claimed.completion;
      if (claimed.code !== 'complete' || !completion || completion.purpose !== 'signup' || completion.destinationStoreId !== result.store.id || completion.destinationOrigin !== destination) return reject('registration_unavailable', 503);
      return secure(await options.complete({request, completion, operationId: input.operationId}));
    } catch (error) {return reject(error instanceof InvalidForm ? 'invalid_input' : 'registration_unavailable', error instanceof InvalidForm ? 400 : 503);}
  };
}
