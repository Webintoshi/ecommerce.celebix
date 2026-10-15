export type ProfitabilityFilters={dateFrom:string;dateTo:string;currency?:string};
export function defaultProfitabilityPeriod(at=new Date()):ProfitabilityFilters{
 const dateTo=at.toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'});
 return{dateFrom:dateTo.slice(0,7)+'-01',dateTo};
}
export function profitabilityFilters(draft:{dateFrom:string;dateTo:string;currency:string}):ProfitabilityFilters{
 const{dateFrom,dateTo}=draft,currency=draft.currency.trim().toUpperCase();
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(dateFrom)||!valid(dateTo))throw Error('Başlangıç ve bitiş için geçerli bir tarih seç.');
 if(dateFrom>dateTo)throw Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
 if((Date.parse(dateTo)-Date.parse(dateFrom))/86400000>=366)throw Error('En fazla 366 günlük bir dönem seç.');
 if(currency&&!/^[A-Z]{3}$/.test(currency))throw Error('Para birimini üç harfle yaz; örneğin TRY.');
 return{dateFrom,dateTo,...currency?{currency}:{}};
}
export function profitabilityGaps(row:{missingCostOrderCount:number;unresolvedReturnCount:number;unclassifiedSupplierPaymentCount:number}):string[]{
 const gaps:string[]=[];
 if(row.missingCostOrderCount)gaps.push(`${row.missingCostOrderCount} satışın ürün maliyeti, sipariş oluşturulurken kaydedilmemiş.`);
 if(row.unresolvedReturnCount)gaps.push(`${row.unresolvedReturnCount} iadenin ürün maliyeti eşleştirilemiyor.`);
 if(row.unclassifiedSupplierPaymentCount)gaps.push(`${row.unclassifiedSupplierPaymentCount} tedarikçi ödemesinin ürün alımı mı, işletme gideri mi olduğu belli değil.`);
 return gaps;
}
