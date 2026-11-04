import {LOYALTY_TEMPLATES,type LoyaltyTemplate,type LoyaltyReward,type LoyaltyConfig,type LoyaltyProgram,type LoyaltyProgramList,type LoyaltyReport,type LoyaltyAdminAction,type LoyaltyAdminPayloadMap,type LoyaltyAdminResultMap,type LoyaltyCustomerAction,type LoyaltyCustomerPayloadMap,type LoyaltyCustomerResultMap} from './types.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX=Number.MAX_SAFE_INTEGER;
function invalid():never{throw new TypeError('loyalty_invalid');}
export function loyaltyExact(value:unknown,required:readonly string[],optional:readonly string[]=[]):Readonly<Record<string,unknown>>{
 if(typeof value!=='object'||value===null||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const d=Object.getOwnPropertyDescriptors(value),allowed=new Set([...required,...optional]),out:Record<string,unknown>={};
 if(required.some(k=>!Object.hasOwn(d,k)))invalid();
 for(const key of Reflect.ownKeys(d)){if(typeof key!=='string'||!allowed.has(key))invalid();const field=d[key];if(!field||!('value'in field)||!field.enumerable)invalid();out[key]=field.value;}
 return Object.freeze(out);
}
export function loyaltyInteger(value:unknown,min=0,max=MAX):number{if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)invalid();return value as number;}
export function loyaltyText(value:unknown,max=200,min=1):string{if(typeof value!=='string'||value.length<min||value.length>max||value!==value.trim()||/[\u0000-\u001f\u007f]/u.test(value))invalid();for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))invalid();}else if(n>=0xdc00&&n<=0xdfff)invalid();}return value;}
export function loyaltyUuid(value:unknown):string{const text=loyaltyText(value,36,36);if(!UUID.test(text))invalid();return text;}
export function loyaltyTimestamp(value:unknown):string{const text=loyaltyText(value,32,20);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,19)!==text.slice(0,19))invalid();return text;}
function timestampOrNull(value:unknown):string|null{return value===null?null:loyaltyTimestamp(value);}
function bool(value:unknown):boolean{if(typeof value!=='boolean')invalid();return value;}
function choice<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))invalid();return value as T;}
function array<T>(value:unknown,maximum:number,parse:(v:unknown)=>T):readonly T[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum)invalid();const d=Object.getOwnPropertyDescriptors(value),out:T[]=[];
 if(Reflect.ownKeys(d).length!==value.length+1)invalid();
 for(let i=0;i<value.length;i++){const item=d[String(i)];if(!item||!('value'in item)||!item.enumerable)invalid();out.push(parse(item.value));}return Object.freeze(out);
}
function ids(value:unknown,max=100):readonly string[]{const result=array(value,max,loyaltyUuid);if(new Set(result).size!==result.length)invalid();return result;}
function template(value:unknown):LoyaltyTemplate{return choice(value,LOYALTY_TEMPLATES);}
export function parseLoyaltyReward(value:unknown):LoyaltyReward{
 const head=loyaltyExact(value,['kind'],['variantId','quantity','amountMinor','shippingMethodIds']);
 if(head.kind==='gift'){const x=loyaltyExact(value,['kind','variantId','quantity']);return Object.freeze({kind:'gift',variantId:loyaltyUuid(x.variantId),quantity:loyaltyInteger(x.quantity,1,20)});}
 if(head.kind==='discount'){const x=loyaltyExact(value,['kind','amountMinor']);return Object.freeze({kind:'discount',amountMinor:loyaltyInteger(x.amountMinor,1,8_000_000_000)});}
 if(head.kind==='shipping'){const x=loyaltyExact(value,['kind','shippingMethodIds']);return Object.freeze({kind:'shipping',shippingMethodIds:ids(x.shippingMethodIds)});}
 return invalid();
}
export function parseLoyaltyConfig(value:unknown):LoyaltyConfig{
 const x=loyaltyExact(value,['schemaVersion','template','target','eligibleProductIds','reward','minimumBasketMinor','rewardMinimumBasketMinor','channels','startsAt','endsAt','timezone','repeat','maxOncePerDay','allowMultiplePrograms','allowCombination','progressExpiryDays','rewardExpiryDays']);
 if(x.schemaVersion!==1)invalid();const t=template(x.template),reward=parseLoyaltyReward(x.reward);
 if((t==='product_gift'||t==='purchase_gift')&&reward.kind!=='gift'||t==='spend_discount'&&reward.kind!=='discount'||t==='purchase_shipping'&&reward.kind!=='shipping')invalid();
 const channels=array(x.channels,3,v=>choice(v,['storefront','in_store','manual'] as const));if(!channels.length||new Set(channels).size!==channels.length)invalid();
 const startsAt=x.startsAt===null?null:new Date(loyaltyTimestamp(x.startsAt)).toISOString(),endsAt=x.endsAt===null?null:new Date(loyaltyTimestamp(x.endsAt)).toISOString();if(startsAt&&endsAt&&Date.parse(startsAt)>=Date.parse(endsAt))invalid();
 const timezone=loyaltyText(x.timezone,100);try{new Intl.DateTimeFormat('tr',{timeZone:timezone}).format();}catch{invalid();}
 return Object.freeze({schemaVersion:1,template:t,target:loyaltyInteger(x.target,1,t==='spend_discount'?8_000_000_000:1_000_000),eligibleProductIds:ids(x.eligibleProductIds),reward,minimumBasketMinor:loyaltyInteger(x.minimumBasketMinor,0,8_000_000_000),rewardMinimumBasketMinor:loyaltyInteger(x.rewardMinimumBasketMinor,0,8_000_000_000),channels,startsAt,endsAt,timezone,repeat:bool(x.repeat),maxOncePerDay:bool(x.maxOncePerDay),allowMultiplePrograms:bool(x.allowMultiplePrograms),allowCombination:bool(x.allowCombination),progressExpiryDays:x.progressExpiryDays===null?null:loyaltyInteger(x.progressExpiryDays,1,3650),rewardExpiryDays:x.rewardExpiryDays===null?null:loyaltyInteger(x.rewardExpiryDays,1,3650)});
}
export function parseLoyaltyProgram(value:unknown):LoyaltyProgram{const x=loyaltyExact(value,['id','name','status','version','config','createdAt','updatedAt']);return Object.freeze({id:loyaltyUuid(x.id),name:loyaltyText(x.name,120),status:choice(x.status,['active','scheduled','paused'] as const),version:loyaltyInteger(x.version,1),config:parseLoyaltyConfig(x.config),createdAt:loyaltyTimestamp(x.createdAt),updatedAt:loyaltyTimestamp(x.updatedAt)});}
export function parseLoyaltyProgramList(value:unknown):LoyaltyProgramList{const x=loyaltyExact(value,['programs']);return Object.freeze({programs:array(x.programs,100,parseLoyaltyProgram)});}
export function parseLoyaltyReport(value:unknown):LoyaltyReport{
 const x=loyaltyExact(value,['program','summary','members','nextCursor']),s=loyaltyExact(x.summary,['members','earned','used','available','reserved','knownCostMinor','unknownCostRewards']);
 return Object.freeze({program:parseLoyaltyProgram(x.program),summary:Object.freeze({members:loyaltyInteger(s.members),earned:loyaltyInteger(s.earned),used:loyaltyInteger(s.used),available:loyaltyInteger(s.available),reserved:loyaltyInteger(s.reserved),knownCostMinor:s.knownCostMinor===null?null:loyaltyInteger(s.knownCostMinor),unknownCostRewards:loyaltyInteger(s.unknownCostRewards)}),members:array(x.members,100,v=>{const m=loyaltyExact(v,['customerId','customerName','progress','target','earned','used','available']);return Object.freeze({customerId:loyaltyUuid(m.customerId),customerName:loyaltyText(m.customerName,300,0),progress:loyaltyInteger(m.progress,-MAX),target:loyaltyInteger(m.target,1),earned:loyaltyInteger(m.earned),used:loyaltyInteger(m.used),available:loyaltyInteger(m.available)});}),nextCursor:x.nextCursor===null?null:loyaltyText(x.nextCursor,2048)});
}
export function parseLoyaltyAdminPayload<A extends LoyaltyAdminAction>(action:A,value:unknown):LoyaltyAdminPayloadMap[A]{
 let result:unknown;
 if(action==='list')result=loyaltyExact(value,[]);
 else if(action==='report'){const x=loyaltyExact(value,['programId'],['limit','cursor']);result={programId:loyaltyUuid(x.programId),...(x.limit===undefined?{}:{limit:loyaltyInteger(x.limit,1,100)}),...(x.cursor===undefined?{}:{cursor:loyaltyText(x.cursor,2048)})};}
 else if(action==='save'){const x=loyaltyExact(value,['name','enabled','config'],['programId','expectedVersion']);if((x.programId===undefined)!==(x.expectedVersion===undefined))invalid();result={name:loyaltyText(x.name,120),enabled:bool(x.enabled),config:parseLoyaltyConfig(x.config),...(x.programId===undefined?{}:{programId:loyaltyUuid(x.programId),expectedVersion:loyaltyInteger(x.expectedVersion,1)})};}
 else if(action==='pause'||action==='duplicate'){const x=loyaltyExact(value,['programId','expectedVersion']);result={programId:loyaltyUuid(x.programId),expectedVersion:loyaltyInteger(x.expectedVersion,1)};}
 else if(action==='adjust'){const x=loyaltyExact(value,['programId','customerId','delta','reason']);const delta=loyaltyInteger(x.delta,-8_000_000_000,8_000_000_000);if(delta===0)invalid();result={programId:loyaltyUuid(x.programId),customerId:loyaltyUuid(x.customerId),delta,reason:loyaltyText(x.reason,500,3)};}
 else if(action==='approve-pos'){const x=loyaltyExact(value,['token'],['saleId']);result={token:loyaltyText(x.token,512),...(x.saleId===undefined?{}:{saleId:loyaltyUuid(x.saleId)})};}
 else if(action==='prepare-pos-reward'){const x=loyaltyExact(value,['saleId','rewardId','expectedVersion']);result={saleId:loyaltyUuid(x.saleId),rewardId:x.rewardId===null?null:loyaltyUuid(x.rewardId),expectedVersion:loyaltyInteger(x.expectedVersion,1)};}
 else invalid();return Object.freeze(result) as LoyaltyAdminPayloadMap[A];
}
export function parseLoyaltyAdminResult<A extends LoyaltyAdminAction>(action:A,value:unknown):LoyaltyAdminResultMap[A]{
 if(action==='list')return parseLoyaltyProgramList(value) as LoyaltyAdminResultMap[A];if(action==='report')return parseLoyaltyReport(value) as LoyaltyAdminResultMap[A];
 if(action==='save'||action==='pause'||action==='duplicate'){const x=loyaltyExact(value,['operationId','program']);return Object.freeze({operationId:loyaltyUuid(x.operationId),program:parseLoyaltyProgram(x.program)}) as LoyaltyAdminResultMap[A];}
 if(action==='adjust'){const x=loyaltyExact(value,['operationId','customerId','programId','progress']);return Object.freeze({operationId:loyaltyUuid(x.operationId),customerId:loyaltyUuid(x.customerId),programId:loyaltyUuid(x.programId),progress:loyaltyInteger(x.progress,-MAX)}) as LoyaltyAdminResultMap[A];}
 if(action==='approve-pos'){const x=loyaltyExact(value,['operationId','customerId','approvalId','expiresAt','availableRewards']);return Object.freeze({operationId:loyaltyUuid(x.operationId),customerId:loyaltyUuid(x.customerId),approvalId:loyaltyUuid(x.approvalId),expiresAt:loyaltyTimestamp(x.expiresAt),availableRewards:parseLoyaltyCustomerResult('list',{programs:[],rewards:x.availableRewards}).rewards}) as LoyaltyAdminResultMap[A];}
 if(action==='prepare-pos-reward')return parseInStoreSaleResult(value,4) as LoyaltyAdminResultMap[A];
 return invalid();
}
export function parseLoyaltyCustomerPayload<A extends LoyaltyCustomerAction>(action:A,value:unknown):LoyaltyCustomerPayloadMap[A]{if(action==='list'||action==='approve-pos')return loyaltyExact(value,[]) as LoyaltyCustomerPayloadMap[A];if(action==='prepare-reward'){const x=loyaltyExact(value,['rewardId']);return Object.freeze({rewardId:loyaltyUuid(x.rewardId)}) as LoyaltyCustomerPayloadMap[A];}return invalid();}
export function parseLoyaltyCustomerResult<A extends LoyaltyCustomerAction>(action:A,value:unknown):LoyaltyCustomerResultMap[A]{
 if(action==='list'){const x=loyaltyExact(value,['programs','rewards']);return Object.freeze({programs:array(x.programs,100,v=>{const p=loyaltyExact(v,['programId','name','template','progress','target','reward']);return Object.freeze({programId:loyaltyUuid(p.programId),name:loyaltyText(p.name,120),template:template(p.template),progress:loyaltyInteger(p.progress,-MAX),target:loyaltyInteger(p.target,1),reward:parseLoyaltyReward(p.reward)});}),rewards:array(x.rewards,100,v=>{const r=loyaltyExact(v,['id','programId','programName','reward','status','earnedAt','expiresAt']);return Object.freeze({id:loyaltyUuid(r.id),programId:loyaltyUuid(r.programId),programName:loyaltyText(r.programName,120),reward:parseLoyaltyReward(r.reward),status:choice(r.status,['available','reserved','used','revoked','expired'] as const),earnedAt:loyaltyTimestamp(r.earnedAt),expiresAt:timestampOrNull(r.expiresAt)});})}) as LoyaltyCustomerResultMap[A];}
 if(action==='prepare-reward'){const x=loyaltyExact(value,['operationId','rewardId','code','reward','giftProductId','expiresAt']),code=loyaltyText(x.code,64),reward=parseLoyaltyReward(x.reward);if(!/^L-[A-Fa-f0-9]{32}$/u.test(code)||reward.kind!=='gift'&&x.giftProductId!==null)invalid();return Object.freeze({operationId:loyaltyUuid(x.operationId),rewardId:loyaltyUuid(x.rewardId),code,reward,giftProductId:reward.kind==='gift'?loyaltyUuid(x.giftProductId):null,expiresAt:timestampOrNull(x.expiresAt)}) as LoyaltyCustomerResultMap[A];}
 if(action==='approve-pos'){const x=loyaltyExact(value,['operationId','customerId','approvalId','token','expiresAt']);return Object.freeze({operationId:loyaltyUuid(x.operationId),customerId:loyaltyUuid(x.customerId),approvalId:loyaltyUuid(x.approvalId),token:loyaltyText(x.token,512),expiresAt:loyaltyTimestamp(x.expiresAt)}) as LoyaltyCustomerResultMap[A];}
 return invalid();
}
export const parseLoyaltyProgramMutation=(value:unknown)=>parseLoyaltyAdminResult('save',value);
export const parseLoyaltyAdjustmentResult=(value:unknown)=>parseLoyaltyAdminResult('adjust',value);
export const parseLoyaltyCustomerList=(value:unknown)=>parseLoyaltyCustomerResult('list',value);
export const parseLoyaltyPreparedReward=(value:unknown)=>parseLoyaltyCustomerResult('prepare-reward',value);
import {parseInStoreSaleResult} from '../in-store-sales/validation.ts';
