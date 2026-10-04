# Pop-up ve sepet yakalama

Kullanıcı uygulama ve ortak canlı yayın için yetki verdi. Taslak/yayınla aşaması yok; Uygula gerçek yapılandırmayı kaydeder.

## Kapsam

- İndirimler > Pop-up: üç hazır düzen, metin ve mağazanın görsel kütüphanesi, cihaz, gecikme ve yeniden gösterim seçimi. Bağımsız kampanyalar açılıp kapatılır.
- Kupon mevcut promosyon motorunda oluşturulur veya seçilir; İndirimler listesinde görünür. İlk sürüm ortak kupon kodudur, müşteriye özel tekil kod olduğu söylenmez. Mevcut koşullar, limitler ve indirim birleşimi korunur.
- Mağaza araçları > Sepet yakalama: ilk başarılı ürün eklemede e-posta/telefon isteği. Şimdi değil alışverişi sürdürür. Ayrı pazarlama izni başlangıçta işaretsizdir; iletişim bilgisi giriş hesabı veya doğrulanmış müşteri kimliği oluşturmaz.
- Yalnız güncel HttpOnly commerce cart kimliği kullanılır. Eski cart-capture cookie yolu kullanılmaz. Temas kaydı mağaza/sepet kapsamındadır; sonraki anonim sepet güncellemeleri bilgiyi silemez. Terk edilmiş sepetin mevcut bekleme süresi korunur.
- Normal pop-up iletişim formu içermez; kupon CTA/kopyalama sunar. Boş sepette kupon adayı kişisel veri olmadan bekler, uygun sepette gerçek kupon hesaplaması çalışır.

## Uygulama ve doğrulama

1. Additive SQL215, sözleşme/parser ve tenant kapsamlı repository; mevcut ödeme ve stok işlevlerinin gövdeleri aynı kalır.
2. Mevcut oturum ve configuration izinleriyle admin API; beklenen sürüm ve işlem anahtarı. Kupon işlemleri ayrı promosyon izinlerini kullanır.
3. Güvenilir host ve aynı origin ile public API; c1 cookie sunucuda özetlenir, sepet kimliği istemciden alınmaz.
4. Ortak admin ve dört vitrin temasının overlay/sepet davranışı; hata sonrası giriş ve işlem anahtarı korunur.
5. İzole veritabanında çapraz mağaza, anonim güncelleme, kupon, aynı işlem, eşzamanlı sürüm ve geçersiz kimlik kontrolleri. Odaklı UI/API testleri, typecheck ve gerçek derleme.
6. Güncel ortak sürüm korunarak uyumlu veri, iki ortak storefront ve iki ortak admin yayını. Özellikler mağaza sahibi açana kadar kapalıdır. Üretimde sahte tahsilat yapılmaz.

Araştırma: Klaviyo resmî form/kupon rehberleri; iletişim formu sonrası kupon sunumu, cihaz/cookie temelli gösterim ve ayrı işaretsiz pazarlama onayı.
