# Güzide PayTR ödeme ekranı düzeltmesi

## Canlı kök neden

1 Ekim 2026 tarihinde çalışan SITE storefront `e8820fabc3849750e34ca8fd80bcb22e37512375` kaynağında derlenmiş TEST/LIVE ödeme yetkileri, veritabanındaki etkin yetkilerle eşleşmiyordu. `celebix_saas_workflow` rolüyle READ ONLY işleminde iki `storefront_hosted_payment_execution_authority_matches` sonucu da `false` çıktı. Kart yöntemi listede görünmesine rağmen ödeme runtime'ı bu kontrol nedeniyle başlatılamıyordu.

Güzide'nin iki PayTR profili mevcut, aktif ve açık mağaza panelindeki merchant numarasıyla eşleşiyor. Profillerin eski execution kimlikleri veritabanı onaylarıyla eşleşiyor. Bunları veya geçmiş denemeleri uygulama yayını SHA'sıyla yeniden yazmak uygun değildir.

## Dar düzeltme

Uygulama yayınının gerçek SHA'sı ve gerçek adaptör kaynak manifesti candidate metadata'da kalır. Execution onayı yalnız aşağıdaki açıkça incelenmiş kaynaklar için mevcut kayıtlı kimliğini korur:

| Alan | Değer |
|---|---|
| Orijinal kaynak | `sha256:07b8bd8d8324dfee9effd013f2b4278296807d4d9368f4510d8727c610c93fc6` |
| Uyumlu kaynak | `sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d` |
| TEST onay kaynak SHA | `d3d4d48860d280b8a2836fc6ca1323929a8e598a` |
| TEST execution kimliği | `sha256:b332fb0e51c6a4e340366507a8eace2aaed42482fb062f085c50576aff931c8f` |
| LIVE onay kaynak SHA | `03f81a1eb1e2546e155a4cce7a822ca3dcf19234` |
| LIVE execution kimliği | `sha256:14bbcbf73e0fbc41c3e4749b4dff59ce5a98df238e82becb2ddc503dea9abf2c` |

İki kaynak arasındaki altı manifest dosyasının tek farkı, digest callback okumasındaki `requirePaymentContext: true` satırının önceki kaldırılmasıdır. HMAC, beklenen tutar, verilmiş para birimi ve ortam doğrulamaları korunmaktadır. Uyumluluk bu iki exact manifest, PayTR ödeme capability'si, adapterVersion 1 ve ilgili TEST/LIVE ortamıyla sınırlıdır.

Generator halen ortamın mevcut doğru approval mode'unu ve doğru current candidate ya da canonical digest'i ister. Onay verilmeyen ortam açık hale gelmez. Kaynak değişirse eski kimlik kullanılmaz; mevcut onay/DB eşleşme kapıları geçerlidir. Bu işlem provider key, merchant credential, ödeme modu, veritabanı onayı, profil, eski payment attempt veya sipariş/stoğu değiştirmez.

## Callback adresi

PayTR mağaza panelinde bildirim URL'si aktif site adresiyle eşleştirildi:

`https://guzidekuyumcu.com/api/payments/paytr/callback`

Panel `Ayarlarınız başarıyla kayıt edilmiştir` sonucunu ve yeni adresi gösterdi. `.com` ve `.com.tr` callback POST yollarına geçersiz sentetik imzalı istekler uygulamadan HTTP 400 aldı; yönlendirme/Cloudflare engeline takılmadı. Geçersiz isteğin reddi gerçek tahsilat veya başarılı callback kabulü değildir. Resmî protokol: [iFrame token](https://dev.paytr.com/iframe-api/iframe-api-1-adim), [sonuç bildirimi](https://dev.paytr.com/iframe-api/iframe-api-2-adim).

## Yerel doğrulama

- Yeni generator regresyonu önce mevcut uygulamada başarısız oldu; düzeltme sonrası generator 9/9 geçti.
- Payment-adapters paketi 125/125 geçti; ilgili storefront hosted ödeme/callback testleri 78/78 geçti.
- Storefront, customer-panel ve owner üretim derlemeleri geçti.
- Bağımsız review PASS: source manifestleri ve eski execution kimlikleri ayrı hesaplandı; yanlış ortam, bilinmeyen kaynak ve disabled onay testleri geçti.

## Yayın kapısı

Ortak storefront kaynakları güncel `e8820fa` checkout/telefon çalışması üzerine hazırlanır. Coolify'nin resmi deployment queue'u, ortak yayın kilidi, boş kuyruk kontrolü, şifreli ayar yedeği, dar pin/onay satırı değişikliği ve preview satırı koruması kullanılır. NET/SITE sıralı yayımlanır; ödeme bayrakları ve sağlayıcı sırları korunur. Customer-panel ve owner kaynak pinleri bu storefront acil yayınının kapsamı dışındadır.

## Canlı kabul — tamamlandı

- Yayımlanan uygulama kaynağı: `7fe154189ca665e562452a3433b05cb09876c3d4`.
- NET dağıtımı `i9yneb1x1062a5n5axhcov4g`, SITE dağıtımı `hsp7bcxxqwbfwjglm35jloy2`: ikisi de `finished`; çalışan container image'ları bu SHA ile eşleşiyor.
- Korumalı yayın doğrulaması: `status: verified`, `targetCount: 2`, `globalIdle: true`; diğer ayar ve preview satırları korunmuştur.
- SITE container'ındaki generated metadata gerçek yeni uygulama SHA'sını ve incelenmiş adaptör source manifestini taşıyor. Derlenmiş TEST/LIVE execution kimlikleri mevcut kayıtlı kimliklerdir.
- Canlı uygulama bağlantısıyla `BEGIN READ ONLY` / `celebix_saas_workflow` rolü altında TEST ve LIVE DB eşleşmeleri **true**.
- Aynı gerçek runtime kontrolü yayından önce `hostedPayment: false`, yeni container'da **`hostedPayment: true`** döndü.
- Güzide'nin mevcut LIVE şifreli profilini uygulamanın mevcut anahtarıyla yalnız bellekte açarak, mevcut bounded transport/adaptör üzerinden teknik get-token isteği gönderildi: HTTP 200, `status: success`. Ödeme ekranı Chrome'da açıldı; kart sahibi, kart numarası, tarih, CVV ve ödeme düğmesi görünür.
- Bu sağlayıcı testi sentetik `CV` referansı ve 1 TL doğrulama tutarı kullanır. Veritabanına sipariş/deneme yazmaz, stok ayırmaz/düşürmez, kart bilgisi girmez ve tahsilat yapmaz. Gerçek checkout formu → sipariş → kart tahsilatı → başarılı callback uçtan uca zinciri bu testin kapsamı değildir.
- Teknik profil kopyası yalnız şifreli olarak geçici dosyada tutuldu; teşhis sonunda container/host kopyaları kaldırıldı. Credential, HMAC ve token loglanmadı.
- Görüntüler: `.tmp/paytr-runtime-hotfix/paytr-callback.jpg` (kaydedilmiş bildirim URL'si) ve `.tmp/paytr-runtime-hotfix/paytr-payment-form.jpg` (açılan teknik ödeme ekranı).
