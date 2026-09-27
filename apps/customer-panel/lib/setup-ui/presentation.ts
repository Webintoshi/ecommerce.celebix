import type { SetupItem, SetupItemState, SetupStatus } from "../server-setup/types.ts";
type Id=keyof SetupStatus;
export type SetupRow=Readonly<{id:Id;label:string;state:SetupItemState;status:string;detail:string;href:string|null;action:string;recommendation:string|null}>;
export type SetupGroup=Readonly<{id:"access"|"sales";label:string;items:readonly SetupRow[]}>;
const LABELS:Record<Id,string>={access:"Panel ve mağaza erişimi",domains:"Alan adları",products:"Ürünler",design:"Mağaza tasarımı",delivery:"Teslimat",payment:"Ödeme"};
const ACTIONS:Record<Id,readonly[string,string]>={access:["/setup","Yeniden kontrol et"],domains:["/settings/domains","Alan adlarını aç"],products:["/products/new","Ürün ekle"],design:["/settings/design","Tasarımı aç"],delivery:["/settings/shipping#checkout-delivery","Teslimatı düzenle"],payment:["/settings/payment","Ödeme ayarlarını aç"]};
const STATUS:Record<SetupItemState,string>={ready:"Hazır",action_required:"İşlem gerekiyor",unavailable:"Kontrol edilemiyor",restricted:"Yetki gerekli"};
export function setupPresentation(value:SetupStatus):readonly SetupGroup[] {
 function row(id:Id):SetupRow {
  const item=value[id];let status=STATUS[item.state],detail:string;
  if(item.state==="unavailable")detail="Güncel durum okunamadı. Yeniden kontrol edin.";
  else if(item.state==="restricted")detail="Bu bölüm için yetkiniz veya plan erişiminiz yok.";
  else switch(id){
   case "access":detail="Panel ve mağaza adresleri doğrulandı.";break;
   case "domains":detail=item.state==="ready"?"Birincil alan adı etkin.":"Birincil alan adı ayarını tamamlayın.";break;
   case "products":detail=item.state==="ready"?"Satışa açık ürününüz var.":"Satışa açık ürününüz yok. İlk ürününüzü ekleyin.";break;
   case "design":detail=item.state==="ready"?"Yayınlanmış tasarım kullanılıyor.":"Mağaza tasarımını yayınlayın.";break;
   case "delivery":detail=item.state==="ready"?(item.code==="delivery_free"?"Ücretsiz teslimat etkin.":"Teslimat ücreti etkin."):"Teslimat ücretini tanımlayın ve etkinleştirin.";break;
   case "payment":
    switch(value.payment.kind){
     case "offline":status="Manuel yöntem etkin";detail="Manuel ödeme yöntemi etkin.";break;
     case "live":status="Canlı ödeme hazır";detail="Canlı kartlı ödeme yöntemi kullanıma hazır.";break;
     case "test":status="Test ortamı";detail="Test yöntemi etkin. Canlı tahsilat ayarlarını tamamlayın.";break;
     case "configured":status="Tamamlanmalı";detail="Yöntem tanımlı. Tahsilata hazırlığı kontrol edin.";break;
     default:status="Tanımlanmadı";detail="Kullanacağınız ödeme yöntemini tanımlayın.";
    }
  }
  const recommendation=item.recommendation==="optional_logo"?"İsterseniz logo ekleyin.":item.recommendation==="unpublished_changes"?"Yayınlanmamış tasarım değişiklikleri var.":null;
  return Object.freeze({id,label:LABELS[id],state:item.state,status,detail,href:item.state==="restricted"?null:ACTIONS[id][0],action:ACTIONS[id][1],recommendation});
 }
 return Object.freeze([{id:"access",label:"Erişim kontrolleri",items:Object.freeze([row("access"),row("domains")])},{id:"sales",label:"Satış ayarları",items:Object.freeze([row("products"),row("design"),row("delivery"),row("payment")])}]);
}
