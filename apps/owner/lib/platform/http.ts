import {readBoundedBody,BodyTooLarge} from './body.ts';
import type {PlatformMutation,PlatformOperatorContext} from '@celebix/saas-contracts';
import {parsePlatformMutation,PLATFORM_RESOURCES} from '@celebix/saas-contracts';
export type HttpOperatorResult={kind:string;operator?:PlatformOperatorContext};
export interface PlatformHttpDependencies {
 allowedOrigin?:string;
 resolveOperator():Promise<HttpOperatorResult>;
 read(operator:PlatformOperatorContext,resource:string,query:Record<string,unknown>):Promise<unknown>;
 command(operator:PlatformOperatorContext,mutation:PlatformMutation):Promise<unknown>;
}
const headers={'Cache-Control':'no-store'};
function json(body:unknown,status=200){return Response.json(body,{status,headers});}
function publicError(error:unknown){if(error instanceof BodyTooLarge)return json({error:'İşlem içeriği çok büyük.'},413);const r=error as {code?:string;message?:string};const code=r?.code??r?.message;
 if(code==='operator_denied')return json({error:'Platform erişimi yok.',code},403);
 if(['version_conflict','operation_mismatch'].includes(code??''))return json({error:'Kayıt başka bir oturumda değişti. Güncel kaydı kontrol edin; girdileriniz korunuyor.',code},409);
 if(code==='operation_busy')return json({error:'Bu işlem şu anda çalışıyor. Durumunu kontrol edip aynı işlemden yeniden deneyin.',code},409);
 if(code==='ownership_acceptance_required'||code==='invitation_acceptance_required')return json({error:'Bu erişim değişikliği doğrulanmış davetin kabul edilmesini gerektiriyor.',code},422);
 if(code==='charge_below_collected')return json({error:'Düzeltilen ücret tahsil edilmiş tutardan az olamaz.',code},422);
 if(code==='admin_host_unverified')return json({error:'Mağazanın doğrulanmış yönetim adresi gerekli.',code},422);
 if(code==='verified_identity_ambiguous')return json({error:'Bu e-posta için birden fazla doğrulanmış hesap var. Davet edeceğiniz hesabı seçin.',code},422);
 if(code==='support_denied'||code==='invitation_denied')return json({error:'Bu erişim geçersiz veya süresi dolmuş.',code},403);
 if(['overpayment','limit_below_usage','pending_pos_blocks_downgrade','open_debt_blocks_downgrade','last_owner','staff_limit_reached','verified_identity_required','already_reversed'].includes(code??''))return json({error:({overpayment:'Tutar kalan alacağı aşıyor.',limit_below_usage:'Mevcut kullanım seçilen paketin limitlerini aşıyor.',pending_pos_blocks_downgrade:'Bekleyen mağaza satışları için gerekli özellik kapatılamaz.',open_debt_blocks_downgrade:'Açık borçların yönetimi için muhasebe açık kalmalı.',last_owner:'Son aktif sahip kaldırılamaz.',staff_limit_reached:'Çalışan limiti dolu.',verified_identity_required:'Davet için doğrulanmış kimlik gerekli.',already_reversed:'Bu tahsilatın ters kaydı zaten var.'} as Record<string,string>)[code!],code},422);
 if(code==='record_not_found')return json({error:'Kayıt bulunamadı.',code},404);
 if(code==='invalid_input'||r?.message==='Bilgileri kontrol edip yeniden deneyin.')return json({error:'Bilgileri kontrol edip yeniden deneyin.',code:'invalid_input'},400);
 return json({error:'Hizmete ulaşılamadı. Aynı işlemden yeniden deneyin; girilen bilgiler korunuyor.',code:'unavailable'},503);
}
const allowedActions:Record<string,readonly string[]>={plans:['plan.publish'],subscriptions:['subscription.assign'],billing:['billing.period.create','billing.period.adjust','billing.receipt.record','billing.receipt.reverse'],stores:['sales.pause','sales.resume'],memberships:['membership.update'],invitations:['ownership.invite'],'support-sessions':['support.issue','support.revoke'],operations:['operations.retry']};
export async function handlePlatformHttp(request:Request,segments:readonly string[],deps:PlatformHttpDependencies):Promise<Response>{
 try{
  const auth=await deps.resolveOperator();
  if(auth.kind!=='authorized'||!auth.operator)return json({error:auth.kind==='mfa_required'?'İki aşamalı doğrulama gerekli.':auth.kind==='unavailable'?'Platform bağlantısı kullanılamıyor.':'Doğrulanmış platform sahibi girişi gerekli.',code:auth.kind},auth.kind==='unavailable'?503:auth.kind==='unauthenticated'?401:403);
  const [resource,id]=segments;
  if(!PLATFORM_RESOURCES.includes(resource as never)||segments.length>2||(id&&resource!=='stores'))return json({error:'Sayfa bulunamadı.'},404);
  if(request.method==='GET'){
   const query:Record<string,unknown>={};for(const [k,v] of new URL(request.url).searchParams){if(!['q','status','storeId','email','after','limit','from','to'].includes(k)||v.length>512)return json({error:'Filtreleri kontrol edin.'},400);query[k]=v;}
   if(id){if(!/^[\da-f-]{36}$/i.test(id))return json({error:'Mağaza bulunamadı.'},404);query.storeId=id;}
   return json(await deps.read(auth.operator,id?'store-detail':resource,query));
  }
  if(request.method!=='POST')return json({error:'İşlem desteklenmiyor.'},405);
  if(request.headers.get('origin')!==(deps.allowedOrigin??new URL(request.url).origin))return json({error:'İstek doğrulanamadı.'},403);
  const text=new TextDecoder().decode(await readBoundedBody(request,65_536));
  let body:unknown;try{body=JSON.parse(text);}catch{return json({error:'İşlem bilgisi okunamadı.'},400);}
  const mutation=parsePlatformMutation(body,request.headers.get('idempotency-key'));
  if(!(allowedActions[resource]??[]).includes(mutation.action))return json({error:'İşlem bu sayfada desteklenmiyor.'},400);
  return json(await deps.command(auth.operator,mutation));
 }catch(error){return publicError(error);}
}
