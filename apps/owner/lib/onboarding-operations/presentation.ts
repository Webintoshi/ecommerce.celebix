import type {OperationsData} from './service.ts';
const CODES:Record<string,string>={access_ready:'Erişim doğrulandı',access_pending:'Erişim hazırlanıyor',access_unavailable:'Erişim kontrolü tamamlanamadı',authority_invalid:'Yetki doğrulaması gerekli',completion_pending:'Hesap kurulumu sürüyor',completion_unavailable:'Kurulum geçici olarak tamamlanamadı',completion_failed:'Kurulum inceleme bekliyor'};
export function operationLabel(job:OperationsData['jobs'][number]){
 return {status:job.state==='ready'?'Hazır':job.state==='attention_required'?'İnceleme gerekli':job.state==='leased'?'Kontrol ediliyor':'Bekliyor',detail:CODES[job.safeCode]??'Durum okunamadı',age:job.ageSeconds<60?'Bir dakikadan kısa':`${Math.floor(job.ageSeconds/60)} dakika`,severity:job.severity==='alert'?'15 dakikayı geçti':job.severity==='warning'?'5 dakikayı geçti':''};
}
