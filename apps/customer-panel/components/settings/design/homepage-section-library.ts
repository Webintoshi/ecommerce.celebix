import type { StarterThemeSectionConfigV4 } from "@celebix/saas-contracts";

export const SECTION_LIBRARY=Object.freeze([
 {kind:"banner",label:"Banner",hint:"Tek görsel, slayt veya alt alta bannerlar."},
 {kind:"category_grid",label:"Kategori vitrini",hint:"Kendi seçtiğiniz kategorileri gösterin."},
 {kind:"product_row",label:"Ürün bölümü",hint:"Yeni, indirimli, kategori veya seçili ürünler."},
 {kind:"split_campaign",label:"İkili kampanya",hint:"Yan yana iki görsel bağlantı."},
 {kind:"brand_story",label:"Marka hikâyesi",hint:"Mağazanızı metin ve görselle anlatın."},
 {kind:"value_propositions",label:"Değer önerileri",hint:"Teslimat, güven ve iade vaatleri."},
 {kind:"testimonials",label:"Müşteri yorumları",hint:"Onaylanmış ürün yorumları."},
] satisfies readonly Readonly<{kind:StarterThemeSectionConfigV4["kind"];label:string;hint:string}>[]);
export const SECTION_LABEL=Object.freeze(Object.fromEntries(SECTION_LIBRARY.map(item=>[item.kind,item.label])) as Record<StarterThemeSectionConfigV4["kind"],string>);
