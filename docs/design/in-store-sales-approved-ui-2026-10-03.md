# Mağaza satışı — onaylanan arayüz

Kullanıcı etkileşimli HTML önizlemesini onayladı ve kodlama ile ortak panellerde canlıya alma talimatını verdi. Route: `/orders/quick-links`.

## Birincil görev

Kasiyer doğru varyantı barkod/ad/SKU ile ekler, sepeti kontrol eder ve tahsilatı güvenle kaydeder.

## Korunan işlev envanteri

- Yetkili depo, stok ve fiyatı içeren sunucu araması; tam barkod, aynı varyantı yeniden okutma ve adet.
- Satır silme, görsel/fallback, katalog veya satışa özel fiyat ve ortak fiyat düşüşü/indirim yetki sınırı.
- Yüzde/TL indirimi, uygun ürün ayrımı, düzenle/kaldır.
- CRM müşteri arama/seçme/oluşturma/kaldırma ve satış notu; belirsiz kayıt sonucunda aynı anahtarın korunması.
- Tam tahsilat, kısmi tahsilat, veresiye, vade ve kayıtlı müşteri/yetki şartları.
- Kart (harici POS), nakit ve havale; ödeme hazırlama, dondurma, beyan, tamamlama ve ödeme alınmadı kurtarması.
- Bekletilen/bekleyen/son satışlar, sayfalama, güvenli yeniden açma ve güncel sepeti kabul etme.
- Siparişe bağlı borç tahsilatı, çalışan yetkileri ve günlük toplamlar.
- Yükleme, boş, hata, yetkisiz, çatışma ve belirsiz işlem durumları; klavye odağı ve dialog kilitleri.

## Sunum değişiklikleri

`#f8f7f5` ortak zemin ve mevcut yumuşak kontrol ailesi. Barkod/sepet açık alanda; ince satır çizgileri, tek ödeme özeti yüzeyi. Birim fiyat adet yanında. Müşteri ve not seçimi mevcut bilgilerle görünür. “Kısmi”, mevcut `initialCollectionCents` alanına bir UI seçimi ekler; sözleşme ve hesaplar aynıdır. Boş/tamamlanan durumlar ortak `--cp-art-*` paletindeki hafif SVG ailesini kullanır. Mobilde aynı ödeme düğmesi alt alanda erişilebilir kalır.

## Sınırlar

Üretim değişiklikleri yalnız Console JSX ve CSS. Controller, istemci, API, sözleşmeler, stok/tahsilat hesapları, SQL, auth ve mağaza ayrımı korunur. Yerel QA gerçek bileşeni izole örnek taşıma katmanıyla çalıştırır; gerçek sipariş/tahsilat oluşturmaz.

## Doğrulama

87 POS bileşen, istemci ve controller testi geçti. Üç yeni davranış kontrolü kısmi tahsilatta sıfırın düzenlenebilmesi/tam tahsilatta hata temizliği, sepet tutarı azaldığında fazla tahsilatın görünür kalıp işlemi engellemesi ve tamamlanmış satışta güncel tahsilatın gösterilmesini kapsar. Son görsel, derleme ve canlı doğrulama sonuçları ayrı QA kaydında tutulacaktır.
