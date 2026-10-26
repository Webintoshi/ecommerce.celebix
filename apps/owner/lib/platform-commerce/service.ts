import 'server-only';
import { isIP } from 'node:net';
import type { PlatformIyzicoBuyer, PlatformIyzicoGateway } from './iyzico.ts';
import { commerceDigest, sealCommercePayload, unsealCommercePayload } from './security.ts';

export interface NativeCommerceResult { outcome: string; result_payload: unknown }
export type CommerceCommand = (action: string, args: Record<string, unknown>) => Promise<NativeCommerceResult>;
export interface PublicCommerceOrder {
  id: string; storeId: string; storeName: string; title: string;
  kind: 'package' | 'tool'; offerId: string; term: 'monthly' | 'annual' | 'once';
  netCents: number; vatCents: number; totalCents: number; currency: 'TRY';
  state: 'created' | 'pending' | 'approved' | 'failed' | 'review'; expiresAt: string;
  paymentUrl?: string;
}
type StartResult = { status: 'ready'; paymentUrl: string } | { status: 'pending' | 'unknown' | 'failed'; code?: string };
type CallbackResult = { orderId: string; state: PublicCommerceOrder['state'] };
export interface PlatformCommerceService {
  execute(action: 'redeem' | 'read', payload: unknown): Promise<{ order: PublicCommerceOrder }>;
  execute(action: 'start', payload: unknown): Promise<StartResult>;
  execute(action: 'callback', payload: unknown): Promise<CallbackResult>;
  execute(action: 'webhook', payload: unknown): Promise<{ok:true}>;
  execute(action: 'redeem' | 'read' | 'start' | 'callback' | 'webhook', payload: unknown): Promise<{ order: PublicCommerceOrder } | StartResult | CallbackResult | {ok:true}>;
}
interface Dependencies {
  command: CommerceCommand; gateway: PlatformIyzicoGateway; dataKey: Buffer;
  credentialFingerprint: string; now(): Date;
  verifyWebhook?: (input:{body:Uint8Array;signature:string})=>Readonly<{attemptId:string;token:string}>|null;
}
type Context = { order: Record<string, unknown>; attempt: Record<string, unknown> | null };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{36,256}$/;
function unavailable(): never { throw Error('platform_commerce_unavailable'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) unavailable();
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const result = object(value);
  if (required.some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => ![...required, ...optional].includes(key))) unavailable();
  return result;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) unavailable();
  return value;
}
function uuid(value: unknown): string { const result = text(value, 36); if (!UUID.test(result)) unavailable(); return result; }
function digest(value: unknown): string { const result = text(value, 64); if (!DIGEST.test(result)) unavailable(); return result; }
function integer(value: unknown, min = 0): number { if (!Number.isSafeInteger(value) || (value as number) < min) unavailable(); return value as number; }
function timestamp(value: unknown): string { const result = text(value, 40); if (!Number.isFinite(Date.parse(result))) unavailable(); return result; }
function context(value: NativeCommerceResult): Context {
  if (!value || typeof value.outcome !== 'string' || !value.result_payload) unavailable();
  const raw = exact(value.result_payload, ['order', 'attempt']);
  const result = { order: object(raw.order), attempt: raw.attempt === null ? null : object(raw.attempt) };
  uuid(result.order.orderId); uuid(result.order.storeId);
  if (result.attempt) uuid(result.attempt.attemptId);
  return result;
}
function publicOrder(value: Context): PublicCommerceOrder {
  const order = value.order, netCents = integer(order.netCents, 1), vatCents = integer(order.vatCents), totalCents = integer(order.totalCents, 1);
  if (netCents + vatCents !== totalCents || !Number.isSafeInteger(netCents + vatCents) || order.currency !== 'TRY'
    || !['package', 'tool'].includes(String(order.kind)) || !['monthly', 'annual', 'once'].includes(String(order.term))) unavailable();
  const state: PublicCommerceOrder['state'] = order.status === 'fulfilled' ? 'approved' : order.status === 'paid_review' ? 'review'
    : order.status === 'failed' ? 'failed' : order.status === 'pending' && !value.attempt ? 'created' : 'pending';
  if (!['pending', 'processing', 'fulfilled', 'failed', 'paid_review'].includes(String(order.status))) unavailable();
  return { id: uuid(order.orderId), storeId: uuid(order.storeId), storeName: text(order.storeName), title: text(order.offerName),
    kind: order.kind as PublicCommerceOrder['kind'], offerId: text(order.offerId), term: order.term as PublicCommerceOrder['term'],
    netCents, vatCents, totalCents, currency: 'TRY', state, expiresAt: timestamp(order.expiresAt) };
}
function buyer(value: unknown, orderId: string): PlatformIyzicoBuyer {
  const raw = exact(value, ['id', 'name', 'surname', 'identityNumber', 'email', 'gsmNumber', 'registrationAddress', 'city', 'country'], ['zipCode']);
  if (raw.id !== orderId) unavailable();
  const result: PlatformIyzicoBuyer = { id: orderId, name: text(raw.name, 64), surname: text(raw.surname, 64), identityNumber: text(raw.identityNumber, 50),
    email: text(raw.email, 254), gsmNumber: text(raw.gsmNumber, 16), registrationAddress: text(raw.registrationAddress, 512), city: text(raw.city, 128), country: text(raw.country, 128),
    ...(raw.zipCode === undefined ? {} : { zipCode: text(raw.zipCode, 32) }) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) || !/^\+[1-9][0-9]{7,14}$/.test(result.gsmNumber)) unavailable();
  return result;
}

export function createPlatformCommerceService(deps: Dependencies): PlatformCommerceService {
  if (!Buffer.isBuffer(deps.dataKey) || deps.dataKey.length !== 32 || !DIGEST.test(deps.credentialFingerprint)) unavailable();
  const inquiries = new Map<string, number>();
  function providerToken(value: Context) {
    if (!value.attempt) unavailable();
    const raw = object(unsealCommercePayload(text(value.attempt.sealedProvider, 65_536), deps.dataKey, `provider:${value.attempt.attemptId}`));
    if (raw.credentialFingerprint !== deps.credentialFingerprint || !TOKEN.test(String(raw.token)) || commerceDigest(String(raw.token)) !== value.attempt.tokenDigest) unavailable();
    return {token:String(raw.token),raw};
  }
  function provider(value: Context) {
    const {token,raw} = providerToken(value);
    const paymentPageUrl = text(raw.paymentPageUrl, 2048), url = new URL(paymentPageUrl);
    if (url.protocol !== 'https:' || !['cpp.iyzipay.com', 'sandbox-cpp.iyzipay.com'].includes(url.hostname) || url.username || url.password || url.hash || url.searchParams.get('token') !== raw.token) unavailable();
    return { token: String(raw.token), paymentPageUrl, expiresAt: timestamp(raw.expiresAt) };
  }
  async function reconcile(value: Context, rawToken?: string, requireVerified = false): Promise<Context> {
    if (!value.attempt) unavailable();
    const attemptId = uuid(value.attempt.attemptId), orderId = uuid(value.order.orderId);
    const sealedBuyer = object(unsealCommercePayload(text(value.attempt.sealedBuyer, 65_536), deps.dataKey, `buyer:${attemptId}`));
    if (sealedBuyer.credentialFingerprint !== deps.credentialFingerprint) unavailable();
    const token = rawToken ?? providerToken(value).token;
    if (!TOKEN.test(token) || value.attempt.tokenDigest !== null && value.attempt.tokenDigest !== commerceDigest(token)) unavailable();
    if (['approved', 'paid_review'].includes(String(value.attempt.status))) return value;
    const payment = await deps.gateway.retrieve({ attemptId, orderId, totalCents: integer(value.order.totalCents, 1), token });
    if (payment.status === 'unknown' || payment.status === 'failed' && payment.code !== 'provider_rejected') {
      if (requireVerified) unavailable();
      return value;
    }
    const approved = payment.status === 'payment' && payment.paymentStatus === 'approved';
    const pending = payment.status === 'payment' && payment.paymentStatus === 'pending';
    const proof = {
      orderId, attemptId, tokenDigest: commerceDigest(token), status: approved ? 'approved' : pending ? 'pending' : 'failed',
      paymentId: payment.status === 'payment' ? payment.paymentId : null, conversationId: attemptId, basketId: orderId,
      priceCents: integer(value.order.totalCents, 1), paidPriceCents: integer(value.order.totalCents, 1), currency: 'TRY', fraudStatus: approved ? 1 : pending ? 0 : -1,
      itemTransactions: payment.status === 'payment' ? payment.itemTransactions.map(item => ({ itemId: item.itemId, transactionId: item.paymentTransactionId, priceCents: item.priceCents, paidPriceCents: item.paidPriceCents })) : [],
    };
    return context(await deps.command('finish', { ...proof, proofDigest: commerceDigest(JSON.stringify(proof)),
      ...(value.attempt.tokenDigest === null ? {sealedProvider:sealCommercePayload({token,credentialFingerprint:deps.credentialFingerprint},deps.dataKey,`provider:${attemptId}`)} : {}) }));
  }
  async function execute(action: 'redeem' | 'read' | 'start' | 'callback' | 'webhook', payload: unknown): Promise<unknown> {
    if (action === 'webhook') {
      const raw = exact(payload,['body','signature']);
      if (typeof raw.body !== 'string' || Buffer.byteLength(raw.body,'utf8')>16_384 || typeof raw.signature !== 'string' || !DIGEST.test(raw.signature) || !deps.verifyWebhook) unavailable();
      const event = deps.verifyWebhook({body:Buffer.from(raw.body,'utf8'),signature:raw.signature});
      if (!event) unavailable();
      const attemptId = uuid(event.attemptId);
      const value = context(await deps.command('lookup',{attemptId}));
      if (value.attempt?.attemptId !== attemptId) unavailable();
      await reconcile(value,event.token,true);
      return {ok:true};
    }
    if (action === 'redeem' || action === 'read') {
      const raw = exact(payload, action === 'redeem' ? ['orderId', 'ticketDigest', 'sessionDigest'] : ['orderId', 'sessionDigest']);
      const orderId = uuid(raw.orderId), sessionDigest = digest(raw.sessionDigest);
      let value = context(await deps.command(action, { orderId, sessionDigest, ...(action === 'redeem' ? { handoffDigest: digest(raw.ticketDigest) } : {}) }));
      if (uuid(value.order.orderId) !== orderId) unavailable();
      if (action === 'read' && value.attempt?.tokenDigest && !['fulfilled', 'paid_review', 'failed'].includes(String(value.order.status))) {
        const attemptId = uuid(value.attempt.attemptId), now = deps.now().getTime();
        if (Number.isFinite(now) && now - (inquiries.get(attemptId) ?? 0) >= 30_000) {
          if (inquiries.size > 1000) inquiries.clear();
          inquiries.set(attemptId, now);
          value = await reconcile(value);
        }
      }
      const selected = publicOrder(value);
      if (selected.state === 'pending' && value.attempt?.status === 'ready') {
        const ready = provider(value);
        if (Date.parse(ready.expiresAt) > deps.now().getTime()) selected.paymentUrl = ready.paymentPageUrl;
      }
      return { order: selected };
    }
    if (action === 'callback') {
      const raw = exact(payload, ['attemptId', 'token']), attemptId = uuid(raw.attemptId), token = text(raw.token, 256);
      if (!TOKEN.test(token)) unavailable();
      const value = context(await deps.command('lookup', { attemptId }));
      if (value.attempt?.attemptId !== attemptId) unavailable();
      const result = await reconcile(value, token);
      return { orderId: uuid(result.order.orderId), state: publicOrder(result).state };
    }
    if (action !== 'start') unavailable();
    const raw = exact(payload, ['orderId', 'sessionDigest', 'attemptId', 'buyer', 'ip']);
    const orderId = uuid(raw.orderId), sessionDigest = digest(raw.sessionDigest), attemptId = uuid(raw.attemptId);
    const selectedBuyer = buyer(raw.buyer, orderId), ip = text(raw.ip, 45);
    if (!isIP(ip)) unavailable();
    const request = { buyer: selectedBuyer, ip, credentialFingerprint: deps.credentialFingerprint };
    const requestDigest = commerceDigest(JSON.stringify(request));
    const claimed = await deps.command('begin', { orderId, sessionDigest, attemptId, requestDigest, sealedBuyer: sealCommercePayload(request, deps.dataKey, `buyer:${attemptId}`) });
    const value = context(claimed);
    if (value.order.orderId !== orderId || !value.attempt) unavailable();
    if (claimed.outcome !== 'initialization_claimed') {
      if (value.attempt.status === 'ready') {
        const existing = provider(value);
        if (Date.parse(existing.expiresAt) > deps.now().getTime()) return { status: 'ready', paymentUrl: existing.paymentPageUrl };
      }
      return { status: 'pending' };
    }
    if (value.attempt.attemptId !== attemptId) unavailable();
    const initialized = await deps.gateway.initialize({ orderId, attemptId, description: text(value.order.offerName), totalCents: integer(value.order.totalCents, 1), buyer: selectedBuyer, ip,
      callbackUrl: `https://celebix.net/api/platform-payments/iyzico/callback/${attemptId}` });
    const saved: Record<string, unknown> = { orderId, attemptId, requestDigest, status: initialized.status };
    if (initialized.status === 'ready') {
      saved.tokenDigest = commerceDigest(initialized.token); saved.expiresAt = initialized.expiresAt;
      saved.sealedProvider = sealCommercePayload({ ...initialized, credentialFingerprint: deps.credentialFingerprint }, deps.dataKey, `provider:${attemptId}`);
    } else saved.code = initialized.code;
    // If recording the provider response is uncertain, keep the claimed attempt. Never initialize it again.
    try { context(await deps.command('initialized', saved)); } catch { return { status: 'unknown', code: 'provider_unavailable' }; }
    return initialized.status === 'ready' ? { status: 'ready', paymentUrl: initialized.paymentPageUrl } : initialized;
  }
  return Object.freeze({ execute }) as PlatformCommerceService;
}
