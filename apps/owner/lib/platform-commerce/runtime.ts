import 'server-only';
import { platformTransaction } from '../platform/database.ts';
import { readPlatformCommerceConfig } from './config.ts';
import { createPlatformIyzicoGateway } from './iyzico.ts';
import { createPlatformCommerceHttpHandler } from './http.ts';
import { createPlatformCommerceService, type NativeCommerceResult } from './service.ts';
import { verifyPlatformIyzicoHppWebhook } from './webhook.ts';

let handler: ((request: Request) => Promise<Response>) | undefined;
export async function executeNativePlatformCommerceCommand(client:{query(text:string,values:unknown[]):Promise<{rows:Record<string,unknown>[]}>},action:string,args:Record<string,unknown>,now=new Date()):Promise<NativeCommerceResult>{
  const result=action==='public_test'
    ?await client.query('SELECT outcome,result_payload FROM saas.platform_checkout_public_test_create($1::timestamptz,$2::uuid,$3::text,$4::text,$5::text)',[now,args.operationId,args.storeSelector,args.sessionDigest,args.ipDigest])
    :await client.query('SELECT outcome,result_payload FROM saas.platform_checkout_machine($1::text,$2::jsonb)',[action,JSON.stringify(args)]);
  if(result.rows.length!==1||Object.keys(result.rows[0]!).sort().join()!=='outcome,result_payload')throw Error('platform_commerce_unavailable');
  const row=result.rows[0]! as unknown as NativeCommerceResult;
  // Closed business rejections must commit their durable rate reservation.
  if(typeof row.outcome!=='string'||(!row.result_payload&&!(action==='public_test'&&row.result_payload===null&&['store_unavailable','rate_limited','operation_mismatch'].includes(row.outcome))))throw Error('platform_commerce_unavailable');
  return row;
}
function resolveHandler() {
  if (handler) return handler;
  const config = readPlatformCommerceConfig();
  if (!config) return null;
  const service = createPlatformCommerceService({
    gateway: createPlatformIyzicoGateway(config.gateway), dataKey: config.dataKey,
    credentialFingerprint: config.credentialFingerprint, now: () => new Date(),
    verifyWebhook: input => verifyPlatformIyzicoHppWebhook({...input,secretKey:config.gateway.secretKey}),
    command: (action,args) => platformTransaction(true,client=>executeNativePlatformCommerceCommand(client,action,args)),
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
