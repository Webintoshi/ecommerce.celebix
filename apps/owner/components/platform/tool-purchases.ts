import type {StoreToolPurchase} from '@celebix/saas-contracts';
import type {CommandSpec,Draft} from './types';
const money=(cents:number)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(cents/100);
function evidence(draft:Draft,name:string,max:number):string{const value=String(draft[name]??'').trim();if(!value||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error(name==='reference'?'Geçerli bir dekont veya kayıt referansı girin.':'Ödemeyi nasıl doğruladığınızı yazın.');return value;}
export function settleToolPurchaseCommand(purchase:StoreToolPurchase):CommandSpec{
 if(purchase.status!=='pending'||purchase.receipt!==null)throw Error('Bu satın alma için tahsilat zaten kaydedilmiş.');
 return{
  title:'Tahsilatı doğrula ve araçları aç',
  description:`${purchase.storeName} · ${purchase.offerName}. ${money(purchase.netCents)} + ${money(purchase.vatCents)} KDV = ${money(purchase.totalCents)}. Yalnızca gerçek tahsilatı hesap veya dekont üzerinden doğruladıktan sonra kaydedin. Tam tutar doğrulandığında mağazanın kalıcı araç hakları açılır.`,
  endpoint:'/api/platform/tool-purchases',action:'tool.purchase.settle',resourceId:purchase.id,expectedVersion:purchase.version,
  initial:{amount:(purchase.totalCents/100).toFixed(2).replace('.',','),method:'bank_transfer',reference:'',reason:''},
  fields:[{name:'amount',label:'Doğrulanacak KDV dahil tutar (TL)',readOnly:true,required:true,help:'Talepteki fiyat sabittir. Kısmi ödeme araçları açmaz.'},{name:'method',label:'Gerçek tahsilat yöntemi',type:'select',required:true,options:[{value:'bank_transfer',label:'Banka havalesi'},{value:'cash',label:'Nakit'},{value:'card',label:'Kart'}]},{name:'reference',label:'Dekont / kayıt referansı',required:true},{name:'reason',label:'Doğrulama açıklaması',type:'textarea',required:true,help:'Ödemeyi hangi kayıt üzerinden doğruladığınızı belirtin.'}],
  payload:draft=>{const method=String(draft.method??'');if(!['bank_transfer','cash','card'].includes(method))throw Error('Gerçek tahsilat yöntemini seçin.');return{purchaseId:purchase.id,storeId:purchase.storeId,amountCents:purchase.totalCents,method,reference:evidence(draft,'reference',200),reason:evidence(draft,'reason',500)};},
 };
}
