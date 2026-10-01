import { normalizeStorefrontAccountPhone } from "./phone.ts";

export type WhatsAppOtpMessage=Readonly<{phone:string;code:string;storeName:string;idempotencyKey:string}>;
export type WhatsAppOtpDelivery=(message:WhatsAppOtpMessage)=>Promise<void>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function unavailable():never {throw new Error("storefront_whatsapp_delivery_unavailable");}
export function createVatanSmsWhatsAppDelivery(options:Readonly<{apiKey:string;regId:string;timeoutMs:number;fetch:(request:Request)=>Promise<Response>}>):WhatsAppOtpDelivery {
  if(!/^[A-Za-z0-9_-]{16,256}$/u.test(options.apiKey)||!/^[0-9]{1,20}$/u.test(options.regId)||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1000||options.timeoutMs>15000)unavailable();
  return async message=>{
    try {
      const phone=normalizeStorefrontAccountPhone(message.phone).slice(1);
      if(!/^[0-9]{6}$/u.test(message.code)||!UUID.test(message.idempotencyKey)||typeof message.storeName!=="string"||message.storeName.length<1||message.storeName.length>200||/[\u0000-\u001f\u007f-\u009f]/u.test(message.storeName))unavailable();
      // NtoN is the connected-device WhatsApp API from the account's own panel.
      // It has no documented idempotency support: ambiguous sends are never retried here.
      const response=await options.fetch(new Request("https://api.toplusms.app/bulk/wp/nton",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(options.timeoutMs),
        headers:{"Content-Type":"application/json","X-Api-Key":options.apiKey},
        body:JSON.stringify({messages:[{reg_id:options.regId,target:phone,message:`${message.storeName} doğrulama kodunuz: ${message.code}. Kod 10 dakika geçerlidir. Bu kodu kimseyle paylaşmayın.`}]}),
      }));
      if(!response.ok||!response.body)unavailable();
      const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
      try {
        for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>32768){await reader.cancel().catch(()=>{});unavailable();}parts.push(next.value);}
        const payload=JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<string,unknown>;
        const reports=payload.reports;
        if(payload.code!==200||payload.status!=="OK"||!Array.isArray(reports)||reports.length!==1)unavailable();
        const report=reports[0] as Record<string,unknown>;
        if(typeof report?.reportId!=="string"||!UUID.test(report.reportId)||report.phone!==phone)unavailable();
      } finally {for(const part of parts)part.fill(0);reader.releaseLock();}
    }catch{unavailable();}
  };
}
