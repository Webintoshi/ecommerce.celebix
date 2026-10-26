import 'server-only';
import { platformTransaction } from '../platform/database.ts';
import { readPlatformCommerceConfig } from './config.ts';
import { createPlatformIyzicoGateway } from './iyzico.ts';
import { createPlatformCommerceHttpHandler } from './http.ts';
import { createPlatformCommerceService, type NativeCommerceResult } from './service.ts';
import { verifyPlatformIyzicoHppWebhook } from './webhook.ts';

let handler: ((request: Request) => Promise<Response>) | undefined;
function resolveHandler() {
  if (handler) return handler;
  const config = readPlatformCommerceConfig();
  if (!config) return null;
  const service = createPlatformCommerceService({
    gateway: createPlatformIyzicoGateway(config.gateway), dataKey: config.dataKey,
    credentialFingerprint: config.credentialFingerprint, now: () => new Date(),
    verifyWebhook: input => verifyPlatformIyzicoHppWebhook({...input,secretKey:config.gateway.secretKey}),
    command: (action,args) => platformTransaction(true,async client => {
      const result = await client.query('SELECT outcome,result_payload FROM saas.platform_checkout_machine($1::text,$2::jsonb)',[action,JSON.stringify(args)]);
      if (result.rows.length !== 1 || Object.keys(result.rows[0]).sort().join() !== 'outcome,result_payload') throw Error('platform_commerce_unavailable');
      const row = result.rows[0] as NativeCommerceResult;
      if (typeof row.outcome !== 'string' || !row.result_payload) throw Error('platform_commerce_unavailable');
      return row;
    }),
  });
  handler = createPlatformCommerceHttpHandler({ key: config.bridgeKey, now: () => new Date(), execute: (action,payload) => service.execute(action,payload) });
  return handler;
}
export async function handlePlatformCommerceRequest(request: Request): Promise<Response> {
  try {
    const resolved = resolveHandler();
    if (resolved) return await resolved(request);
  } catch { /* A partial configuration cannot activate financial execution. */ }
  return Response.json({ok:false,error:'service_unavailable'},{status:503,headers:{'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}});
}
