type Configuration={ownerOrigin:string;panelOrigin:string;panelCallbackUrl:string;authorizationOrigin:string;clientId:string;key:Uint8Array;keyId:string};
type Dependencies={configuration():Configuration;fetch(request:Request):Promise<Response>;clock():Date};
const safeHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"};
export function retiredInvitationResponse():Response {
 return new Response('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mağaza erişimi</title><main><h1>Davet bağlantıları kaldırıldı</h1><p>Telefon numaranızla giriş yapın. Çalışan erişimi için mağaza sahibine başvurun.</p><a href="/login">Girişe dön</a></main></html>',{status:410,headers:safeHeaders});
}
export function createInvitationBrowserHandlers(_dependencies:Dependencies){
 const retired=async(_request:Request)=>retiredInvitationResponse();
 return {start:retired,bootstrap:retired,callback:retired};
}
