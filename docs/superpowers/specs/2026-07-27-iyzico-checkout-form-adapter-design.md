# iyzico Checkout Form Adaptörü Tasarımı

Status: 2026-07-27 tarihli çoklu ödeme sağlayıcı platformu tasarımının sağlayıcıya özgü uygulama eki. Kullanıcı aynı tarihte sıradaki sağlayıcı olarak iyzico ile devam edilmesini açıkça istedi.

Implementation branch: `codex/celebix-managed-umami-analytics`

Provider code: `iyzico_iframe`

## 1. Amaç ve sınır

Bu aşamada iyzico'nun Checkout Form ürünü Celebix'in mevcut hosted-payment adapter runtime'ına eklenir. Her mağaza kendi iyzico API anahtarını ve secret key'ini kullanır. Secret değerleri tenant/store kapsamından çıkmaz ve log, tarayıcı DTO'su veya ödeme metadata'sına yazılmaz.

İlk teslim kapsamı:

- test ve canlı ortam için ayrı API anahtarı/secret doğrulaması;
- Checkout Form başlatma;
- iyzico token'ı ile sunucu tarafında sonuç sorgulama;
- response signature doğrulaması;
- tutar, para birimi, basket/order, conversation ve tenant bağlamı eşleştirmesi;
- başarılı, başarısız, incelemede ve geçici hata sonuçlarının doğru sınıflandırılması;
- müşteri panelinde iyzico Checkout Form kartı, logosu, alanları ve gerçek hazırlık durumu;
- provider-keyed execution authority ve ödeme yöntemi yaşam döngüsü;
- sahte yetki veya sahte sandbox kanıtı üretmeden doğrulama/evidence akışı.

Bu aşamanın dışında kalan ve ayrı adaptör/kabiliyet olarak ele alınacak konular:

- kart bilgisinin Celebix sunucusundan geçtiği doğrudan iyzico API akışı;
- `Pay with iyzico` ürünü;
- kayıtlı kart/card-token yönetimi;
- refund, cancel ve kısmi iade;
- opsiyonel iyzico webhook özelliğinin aktivasyonu.

## 2. Kaynak önceliği

Uygulamanın protokol yetki kaynağı güncel resmi iyzico dokümantasyonudur. Verilen GurmePOS WordPress eklentisi yalnız davranış ve ürün envanteri için kullanılır. Kaynaklar çeliştiğinde resmi doküman esas alınır.

WordPress referansında üç ayrı iyzico ürünü bulunduğu doğrulandı: doğrudan iyzico, iyzico Checkout Form/iframe ve Pay with iyzico. Bu tasarım yalnız Checkout Form'u kapsar. Referans eklentideki sabit sahte T.C. kimlik numarası, plaintext secret saklama, imzasız response kabulü ve ham payload loglama Celebix'e taşınmaz.

## 3. Seçilen yaklaşım

### 3.1 Native TypeScript adaptörü

Seçilen yaklaşım, mevcut `@celebix/payment-adapters` sözleşmesine uyan native TypeScript adaptörüdür. Eski `scripts/iyzico-runner.cjs` subprocess akışı production yolu olarak kullanılmaz.

Gerekçeler:

- mevcut bounded provider transport, timeout ve payload sınırları korunur;
- tenant/store/credential bağlamı generic runtime içinde doğrulanır;
- imza girdileri provider'a özgü küçük ve golden-vector testli bir modülde kalır;
- callback sonucu doğrudan order mutasyonu yapmaz, payment attempt state machine üzerinden ilerler;
- legacy kodda bulunan host güveni, sahte buyer identity ve raw provider response riski taşınmaz.

### 3.2 Hosted-first

Checkout Form, kart verisini iyzico'nun barındırdığı formda işler. Bu, doğrudan kart API'sine göre Celebix'in PCI kapsamını azaltır. Sunucu yine de ödeme sonucunu yalnız browser dönüşüne göre kabul etmez; token ile iyzico'dan sonucu tekrar sorgular.

## 4. Protokol

### 4.1 Endpoint'ler

- Sandbox base URL: `https://sandbox-api.iyzipay.com`
- Canlı base URL: `https://api.iyzipay.com`
- Başlatma: `POST /payment/iyzipos/checkoutform/initialize/auth/ecom`
- Sonuç sorgulama: `POST /payment/iyzipos/checkoutform/auth/ecom/detail`
- Zararsız credential testi: `POST /payment/bin/check`

Base URL kullanıcı girdisi değildir. Ortam enum'undan kod içinde seçilir. Redirect yalnız iyzico'nun izin verilen Checkout Form origin'ine yapılır.

### 4.2 IYZWSv2 istek imzası

Her istek için kriptografik olarak rastgele `randomKey` üretilir.

```text
signature = hex(HMAC-SHA256(randomKey + uriPath + exactRequestBody, secretKey))
authorizationPayload = "apiKey:" + apiKey + "&randomKey:" + randomKey + "&signature:" + signature
Authorization = "IYZWSv2 " + base64(authorizationPayload)
```

İstek `Authorization` ve `x-iyzi-rnd` başlıklarını taşır. Transport yalnız adapter sözleşmesinde açıkça izin verilen bu başlıkları ve `content-type` başlığını kabul eder; serbest header geçişi açılmaz. İmzalanan gövde ile gönderilen byte dizisi aynıdır.

### 4.3 Response signature

İyzico response içindeki `signature`, secret key ile HMAC-SHA256 kullanılarak doğrulanır. Alanlar resmi sırayla ve `:` ayracıyla birleştirilir:

- initialize: `conversationId`, `token`;
- retrieve: `paymentStatus`, `paymentId`, `currency`, `basketId`, `conversationId`, `paidPrice`, `price`, `token`.

Tutar alanları iyzico'nun response signature normalizasyon kuralına göre normalize edilir. Eksik, yanlış tipte veya imzası uyuşmayan response güvenilir ödeme sonucu sayılmaz.

### 4.4 Başlatma

Adapter yalnız doğrulanmış credential version ve etkin execution authority ile çalışır. Başlatma girdisi şunları içerir:

- Celebix attempt/order/basket referansı;
- fiyat ve para birimi;
- müşterinin gerçek adı, e-postası, telefonu, IP adresi ve sağlayıcının zorunlu tuttuğu kimlik/adres alanları;
- order satırları ve doğru item tipi;
- Celebix'in allowlist edilmiş callback URL'si;
- locale ve izin verilen installment seçenekleri.

Sahte `identityNumber`, şehir, ülke veya adres üretilmez. Gerekli buyer alanı mevcut siparişte yoksa istek provider'a gönderilmeden deterministik validation hatası döner.

Başarılı initialize response içinden yalnız ihtiyaç duyulan güvenli alanlar saklanır: token, conversation id, provider checkout URL referansı ve imza doğrulama sonucu. `checkoutFormContent` tarayıcıya ham HTML/script olarak enjekte edilmez. Kullanıcı doğrulanmış `paymentPageUrl` üzerinden iyzico sayfasına yönlendirilir.

### 4.5 Callback ve sonuç sorgulama

Browser callback'i yalnız provider token'ını taşır; tek başına ödeme kanıtı değildir. Runtime:

1. callback route, binding ve attempt bağlamını çözer;
2. token'ın attempt için daha önce kaydedilen token ile constant-time uyumunu doğrular;
3. aynı credential version ile retrieve isteği gönderir;
4. retrieve response signature'ını doğrular;
5. conversation id, basket id, currency, price ve paidPrice alanlarını beklenen attempt ile eşleştirir;
6. sonucu state machine'e uygular;
7. kullanıcıyı yalnız Celebix'in allowlist edilmiş sonuç sayfasına `303` ile yönlendirir.

Callback response body provider secret'ı, ham payload'ı veya hata ayrıntısını içermez. Tekrarlanan callback idempotent işlenir. Provider sorgusu timeout/geçici hata verirse attempt başarılı veya başarısız yapılmaz; retry/reconcile bekleyen duruma alınır.

## 5. Sonuç sınıflandırması

Ödeme ancak tüm bağlamsal kontroller geçtikten sonra başarı sayılır:

- API `status=success`;
- `paymentStatus=SUCCESS`;
- `fraudStatus=1`;
- response signature geçerli;
- beklenen token, conversation, basket, tutar ve para birimi tam eşleşir.

`fraudStatus=0` inceleme/reconcile bekleyen sonuçtur; ürün veya sipariş teslim edilmez. `fraudStatus=-1`, açık provider başarısızlığı ve diğer nihai olumsuz sonuçlar failed olarak sınıflandırılır. Ağ hatası, timeout, 5xx, bozuk JSON, eksik alan veya doğrulanamayan imza `invalid` ya da `temporary_failure` olarak ayrılır; hiçbirisi false success üretmez.

## 6. Credential doğrulama

Bağlantı testi gerçek tahsilat yapmaz. Sağlayıcının BIN sorgu endpoint'ine resmi sandbox test BIN'i ve sabit, zararsız test fiyatı ile imzalı istek atılır. Bu işlem yalnız anahtar/secret kombinasyonunun ve ortam erişiminin geçerli olduğunu doğrular.

Doğrulama sırasında:

- ham API key/secret loglanmaz;
- provider response yalnız allowlist edilmiş alanlara indirgenir;
- timeout ve rate limit geçici hata olarak ayrılır;
- sandbox ve canlı credential'ları karıştırılmaz;
- credential doğrulaması başarılı olsa bile ödeme yürütme yetkisi otomatik verilmez.

## 7. Kontrol düzlemi ve yetki

PayTR'a özel tekil registry/authority kabulleri provider-keyed hale getirilir. Her sağlayıcı/mode için ayrı:

- adapter descriptor hash;
- packet/contract hash;
- compiled execution authority;
- credential validation adapter;
- payment method lifecycle;
- sandbox evidence geçmişi bulunur.

Katalog kartı bütün kullanıcılara görünür. Credential toplama ve bağlantı testi, kontrollü `verification` durumunda yapılabilir; ancak checkout etkinleştirme yalnız doğrulanmış credential, exact compiled authority ve gerekli sandbox evidence bir aradaysa mümkün olur. Böylece kullanıcı anahtarlarını hazırlayabilir ama doğrulanmamış kod ödeme alamaz.

Iyzico için authority/evidence kaydı additive migration ile eklenir. Daha önce uygulanmış PayTR migration'ları değiştirilmez. Sahte authority, elle yazılmış başarı veya kanıtsız `sandbox_ready` kaydı seed edilmez.

## 8. Panel deneyimi

Iyzico Checkout Form kartı mevcut katalogdaki resmi/yerel logo asset'ini kullanır. Drawer alanları:

- ortam: test veya canlı;
- API Key;
- Secret Key;
- gösterim biçimi: iyzico hosted sayfasına güvenli yönlendirme;
- kopyalanabilir callback URL;
- bağlantıyı test et;
- doğrulama ve aktivasyon durumu.

Secret alanı kayıttan sonra geri okunmaz. Test sonucu anlaşılır ve eyleme dönük olur. `Doğrulandı`, `Sandbox kanıtı bekleniyor`, `Aktivasyona hazır` ve `Aktif` durumları birbirine karıştırılmaz.

## 9. Kanıt ve aktivasyon

Production execution authority ancak şu testler ve kanıtlar geçtikten sonra onaylanır:

- resmi imza vektörleri;
- initialize success/failure contract testleri;
- retrieve success, decline, fraud review ve mismatch testleri;
- timeout/5xx/malformed response testleri;
- cross-tenant, replay ve credential-version mismatch testleri;
- gerçek iyzico sandbox credential'ı ile credential validation;
- resmi test kartlarıyla başarılı ödeme, başarısız ödeme ve callback dönüşü;
- veritabanında doğru attempt/event/idempotency/evidence kaydı;
- PayTR regresyon testleri ve admin/storefront donor dizinlerinde sıfır diff.

Sandbox credential bulunmadığı sürece adapter kodu ve sentetik contract testleri tamamlanabilir, fakat durum en fazla `verification` olur. Bu dürüst sınır panelde ve teslim raporunda açıkça görünür.

## 10. Gözlemlenebilirlik ve veri minimizasyonu

Log/telemetri yalnız Celebix kimlikleri, provider code, environment, süre, sınıflandırılmış hata kodu ve güvenli provider payment id gibi allowlist edilmiş alanları içerir. Aşağıdakiler hiçbir log veya browser DTO'sunda yer almaz:

- API key ve secret;
- Authorization başlığı ve random key;
- buyer kimlik numarası/adresinin ham hali;
- provider'ın ham request/response gövdesi;
- kart veya test kartı verisi;
- imza girdisinin secret içerebilecek tam dökümü.

## 11. Dağıtım ve geri dönüş

Kod adapter registry'ye eklenir fakat exact authority olmadan execution kapalı kalır. Deploy sonrası:

- build ve testler çalıştırılır;
- provider katalog/panel smoke testi yapılır;
- PayTR davranışının değişmediği doğrulanır;
- Coolify deployment commit SHA ile eşleştirilir;
- Iyzico authority yokken checkout başlatmanın fail-closed kaldığı kanıtlanır.

Sorun halinde catalog entry görünür kalabilir; provider-specific authority revoke edilerek yalnız iyzico yürütmesi durdurulur. Diğer sağlayıcılar etkilenmez.
