import 'server-only';
export async function ownerAuthFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const internal=process.env.CELEBIX_OWNER_AUTH_INTERNAL_URL?.trim();
 if(!internal)return fetch(input,init);
 const original=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const url=new URL(original);
 if(url.pathname.startsWith('/auth/v1/')){
  const endpoint=new URL(internal);
  if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('owner_auth_endpoint_invalid');
  endpoint.pathname=url.pathname.slice('/auth/v1'.length);endpoint.search=url.search;
  return fetch(endpoint,input instanceof Request?{method:input.method,headers:input.headers,body:input.body,duplex:'half',...init} as RequestInit:init);
 }
 return fetch(input,init);
}
