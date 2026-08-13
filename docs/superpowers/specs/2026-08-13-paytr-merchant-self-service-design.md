# PayTR Merchant Self-Service Design

## Status

Kullanici, Güzide Kuyumcu'daki mevcut PayTR ayar ekranini canli ve read-only
referans olarak gösterdi; asagidaki Celebix yaklasimini 2026-08-13 tarihinde
yazili olarak onayladi.

## Amac

Celebix merchant admin icinde PayTR kurulumunu standart bir magazacilik akisi
haline getirmek. Magaza sahibi kendi PayTR bilgilerini girer, test modunu secer
ve tek bir kaydet aksiyonuyla baglantiyi kurar. Celebix'in credential sifreleme,
provider dogrulama, callback guvenligi ve execution-authority kontrolleri arka
planda kalir; merchant'a altyapi sertifikasyonu veya ic runtime terimleri
gosterilmez.

Bu teslim yalniz bir form makyaji degildir. Basarili kurulumdan sonra PayTR
yontemi gercek tenant profiline baglanmali, aktif payment method haline gelmeli
ve storefront checkout projection'ina yansimalidir.

## Referans Incelemesi

Kullanicinin verdigi authenticated WordPress POS Entegrator PayTR ekrani
read-only incelendi. Referans yuzey su kadar basittir:

- ustte `Test Modu` anahtari;
- `Merchant ID`, `Merchant Password` ve `Merchant Salt` alanlari;
- tek `Ayarlari Kaydet` aksiyonu;
- sabit ve kopyalanabilir bildirim URL'si;
- PayTR satici paneli ve yardim baglantilari;
- desteklenen ozellik ve para birimlerinin ikincil bilgi olarak sunulmasi.

Canli ekranda gorulen credential degerleri bu dokumana, loglara, testlere veya
kod tabanina alinmaz.

## Mevcut Celebix Durumu

Kod tabaninda gereken temel guvenlik katmanlarinin cogu vardir:

- `PAYTR_IFRAME_PACKET` ve hosted PayTR adapteri;
- tenant-bazli sealed merchant credential profilleri;
- credential validation worker ve PayTR get-token dogrulamasi;
- payment method, payment attempt, callback binding ve reconciliation
  repository'leri;
- sabit `/api/payments/paytr/callback` route'u ve PayTR `merchant_oid` degerini
  exact attempt digest'ine baglayan callback koprusu;
- standart checkout hosted-card projection ve settlement altyapisi.

Bugunku kullanici problemi, PayTR adapterinin panel ve storefront compiled
authority haritalarinda kapali olmasi ve katalog kartinin bu nedenle
`Hazirlaniyor` durumunda kalmasidir. PayTR profil kaydi execution authority'ye
bagli oldugu icin merchant kendi bilgilerini dahi girememektedir. Bu urun
davranisi duzeltilir; ortak credential veya magaza-ozel env kullanimi eklenmez.

## Degerlendirilen Yaklasimlar

### A. Basit self-service kurulum

Secilen yaklasimdir. Merchant tek ekranda kendi bilgilerini girer. Sistem
credential'i sifreli kaydeder, arka planda provider erisimiyle dogrular ve
basarili sonuc sonrasinda payment method'u etkinlestirir.

### B. Cok adimli kurulum sihirbazi

Reddedildi. Uc credential ve bir test modu secimi icin gereksiz operasyonel
yuk olusturur.

### C. Operator tarafindan manuel baglanti

Reddedildi. Merchant'i Celebix ekibine bagimli birakir ve coklu magaza urun
modeline uymaz.

## Merchant Deneyimi

### Katalog karti

PayTR iFrame karti `Hazirlaniyor` veya `Dogrulaniyor` ile bloke edilmez.
Duruma gore tek aksiyon gosterir:

- profil yok: `Kur`;
- profil pending: `Kontrol ediliyor`;
- profil aktif: `Yapilandirildi`;
- credential reddedildi: `Bilgileri duzelt`;
- profil devre disi: `Yeniden etkinlestir`.

Kartta kullaniciya `execution authority`, `sandbox evidence`, adapter version
veya deployment mode gibi ic kavramlar gosterilmez.

### Kurulum cekmecesi

Tek, kompakt form su sirayla acilir:

1. PayTR iFrame basligi ve kisa aciklama.
2. `Test Modu` toggle'i.
3. `Magaza numarasi` metin alani.
4. `Magaza parolasi` password alani.
5. `Magaza gizli anahtari` password alani.
6. Magazaya ait sabit bildirim URL'si ve kopyalama aksiyonu.
7. `PayTR Satici Panelini Ac` dis baglantisi.
8. Tek primary `Ayarlari Kaydet` butonu.

Credential alanlari mevcut bir profil acildiginda bos kalir; sirlar browser'a
geri gonderilmez. Maskeli hesap referansi ve son basarili kontrol zamani
gosterilebilir.

PayTR bildirim URL'sini programatik olarak degistiren bir provider API'si
varsayilmaz. Merchant bu sabit adresi PayTR paneline bir kez kaydeder. Celebix
cekmece icinde bunu tek satirlik yonlendirme olarak anlatir; callback ayarlanmis
gibi sahte bir onay gostermez.

Ayni magazada baska bir hosted provider aktifse form kaydetmeden once yalniz o
durumda kompakt bir uyari gosterir: PayTR etkinlestiginde mevcut kart
saglayicisinin devre disi kalacagi acikca belirtilir.

### Test modu

Toggle acikken method config `environment: "test"` olur ve provider
isteklerinde `test_mode=1` kullanilir. Toggle kapaliyken config
`environment: "live"` olur ve `test_mode=0` kullanilir.

Test ve live icin ayri credential setleri istenmez; secilen ortam profile ve
payment method snapshot'inda exact olarak saklanir. Ortam degisikligi credential
yeniden dogrulamasi gerektirir ve onceki execution binding sessizce yeniden
kullanilmaz.

## Kaydetme ve Aktivasyon Akisi

1. Browser yalniz provider code, test modu, uc form alani, mevcut profile
   version'i ve tek kullanimlik operation ID gonderir.
2. Customer-panel route'u tenant, membership ve `integrations.manage`
   yetkisini server-side cozer. Browser store ID veya execution authority
   belirleyemez.
3. Public config strict parser ile yalniz `environment` ve `merchantId`
   kabul eder. Credential parser yalniz `merchantKey` ve `merchantSalt` kabul
   eder.
4. Credential tenant/profile/version amacina bagli keyring ile seal edilir.
5. Profil `pending_validation` olarak replay-safe kaydedilir. Raw secret istek
   omru bittiginde bellekten temizlenir.
6. Owner validation worker profili lease ile claim eder, credential'i yalniz
   worker icinde acar ve bounded PayTR get-token kontrolu yapar. Token alinmasi
   kart formu acmaz, callback uretmez ve tahsilat yapmaz.
7. Kesin provider reddi profili `rotation_required` yapar ve payment method
   etkinlesmez. Gecici erisim sorunu profili pending birakir ve guvenli retry'a
   izin verir.
8. Dogrulama basariliysa profil `active` olur. Exact provider/environment/build
   authority ile eslesiyorsa ayni durable sonuc icinde PayTR payment method'u
   olusturulur veya guncellenir ve `active` yapilir. Method config kullanicidan
   yeni alan istemeden mevcut strict contract'in guvenli varsayilanlarini
   kullanir: secilen environment, `provider_managed` 3D, tum taksitler ve mevcut
   magaza dili.
9. Ayni magazada baska aktif hosted provider varsa mevcut tek-aktif-provider
   kurali korunur. PayTR'a gecis explicit kaydet aksiyonunun sonucu olarak
   atomik yapilir; unique-constraint ihlali kullaniciya belirsiz basari olarak
   donmez.
10. UI profil ve method durumunu bounded polling ile yeniler. Kullanici sayfayi
    kapatsa bile validation ve aktivasyon durable worker tarafinda tamamlanir.

## Platform Readiness

Merchant akisini basitlestirmek, platform adapter kanitini kaldirmak anlamina
gelmez. PayTR icin bir defaya mahsus platform readiness su sekilde tamamlanir:

- PayTR build metadata ve approved execution authority, iyzico'daki mevcut
  build-binding desenine uygun olarak kodla baglanir;
- source digest, adapter version ve candidate evidence digest exact
  dogrulanir;
- test readiness, PayTR test get-token + hosted presentation + imzali callback
  + status query kanitindan uretilir;
- live readiness, ayni build'in live `test_mode=0` kontratini destekledigini ve
  provider'in merchant-bazli live token verdigini dogrular;
- sahte digest, elle yazilmis success veya credential'dan turetilmis ortak env
  authority kabul edilmez.

Bu platform katmani merchant ekraninda gorunmez. Ortak bir Hemenaku, Guzide veya
baska magaza credential'i runtime env'i olarak kullanilmaz. Her checkout yalniz
o magazanin sealed profilini acar.

## Callback ve Checkout

- Merchant'a gosterilen bildirim adresi sabittir:
  `https://<storefront-hostname>/api/payments/paytr/callback`.
- PayTR paneline bu URL kaydedilir; isleme ozel gizli binding merchant'a
  gosterilmez.
- Hosted initialization, `merchant_oid` icinde exact callback-binding digest
  kullanir.
- Callback route trusted hostname, canonical form body, PayTR HMAC, merchant
  OID, amount, currency, environment, credential version ve attempt authority
  kontrollerini korur.
- Browser success URL'si odeme kaniti sayilmaz. Siparis yalniz dogrulanmis
  callback veya reconciliation sonucu `captured` oldugunda olusur.
- Basarili aktivasyon sonrasinda storefront quote en fazla bir `hosted_card`
  yontemi yansitir. PayTR iframe token'i server-side uretilir; kart verisi
  Celebix'e girmez.

## Durum ve Hata Metinleri

Sonlu ve kullanici odakli durumlar:

- `Kurulmadi`
- `Kontrol ediliyor`
- `Aktif - Test modu`
- `Aktif - Canli`
- `PayTR bilgileri dogrulanamadi`
- `PayTR'a su anda ulasilamiyor`
- `Bilgiler yenilenmeli`
- `Devre disi`

Provider raw error metni, token, callback body veya credential detayi UI/loglara
cikmaz. Hata formun ustunde kompakt callout olarak gorunur; kaydet butonu
yeniden denemeye izin verir. Version conflict formu guncel profil snapshot'i ile
yeniler ve kullanicinin secret alanlarini otomatik tekrar gondermez.

## Guvenlik Sinirlari

- Merchant credential'lari tenant/profile/version amacina bagli sealed envelope
  olarak saklanir.
- Credential degerleri GET response, RSC payload, analytics, toast, log, test
  fixture veya screenshot'a yazilmaz.
- PayTR merchant key ve salt browser'a geri donmez.
- Customer-panel, owner worker ve storefront ayni exact keyring ve credential
  schema version kontratini kullanir.
- Provider network cagrisi acik database transaction veya row lock altinda
  yapilmaz.
- Callback public olmak zorundadir fakat authentication HMAC ve durable attempt
  authority ile yapilir; login/cookie aranmaz.
- Save, validation, method activation ve callback replay-safe ve idempotenttir.
- Cross-store profile, method, callback veya credential binding fail-closed
  reddedilir.
- Mevcut havale ve kapida odeme yontemleri gerilemez.

## Tasarim Sistemi

- Cekmece mevcut customer-panel modal/drawer pattern'ini kullanir.
- Desktop'ta kompakt tek kolon; mobilde 390 px viewport'ta yatay tasma olmadan
  tam genislik alanlar kullanilir.
- Secret alanlar icin gostergeli password kontrolu ve erisilebilir label vardir.
- Test modu binary oldugu icin switch kullanilir.
- Callback icin copy ikonu ve tooltip kullanilir; URL duzenlenebilir input
  degildir.
- Primary renk mevcut Celebix `#FE6100`; status rengi tek basina anlam tasimaz.
- Form gonderilirken tek buton loading olur, tum cekmece gereksiz yere
  kilitlenmez; cift gonderim operation ID ile de engellenir.

## Uygulama Kapsami

Beklenen degisiklik alanlari:

- `apps/customer-panel`: PayTR katalog durumu, connection view-model,
  kurulum cekmecesi, route handler ve polling;
- `apps/owner`: PayTR verification registry/config ve worker baglantisi;
- `packages/payment-adapters`: test/live validation ve build-binding;
- `packages/saas-data`: verification sonucu ile PayTR payment method aktivasyonunu
  atomiklestiren repository contract'i;
- `apps/owner/scripts/sql/saas`: gerekiyorsa additive migration, assertion ve
  rollback;
- `apps/storefront-shared`: compiled PayTR authority, test/live runtime secimi
  ve mevcut sabit callback koprusunun regresyon kaniti;
- focused unit, route, repository, SQL ve browser testleri.

Mevcut schema exact atomik aktivasyonu sagliyorsa yeni tablo eklenmez. Migration
yalniz mevcut verification finalize fonksiyonunu provider-keyed auto-activation
ile genisletmek icin gerekliyse additive olarak kullanilir.

## Test Stratejisi

Uygulama red-green-refactor ile ilerler.

### Unit ve contract

- PayTR karti authority yokken bile credential kurulumuna aciktir;
- public config test/live ve exact alanlari dogrular;
- secret parser bilinmeyen/eksik alanlari reddeder ve buffer temizler;
- callback URL PayTR icin sabit, diger providerlar icin mevcut davranistadir;
- status ve aksiyon etiketleri profil/method gercegiyle birebir eslesir;
- raw credential ve ic authority terimleri view-model'e sizmaz.

### Worker ve provider

- test ve live get-token payload/hash vektorleri;
- provider success, reject, timeout ve malformed response;
- claim/lease/replay ve commit-unknown recovery;
- validation success -> active profile + active PayTR method;
- reject/unavailable -> yontem etkin degil;
- credential rotation ve environment degisiminde eski binding devre disi.

### PostgreSQL

- iki store arasinda profile, method ve operation izolasyonu;
- tek aktif hosted provider;
- validation sonucu ile method aktivasyonunun atomikligi;
- exact ACL, SECURITY DEFINER, RLS ve preflight;
- migration apply/assert/rollback/reapply;
- havale ve kapida odeme regresyonu.

### Browser ve staging

- PayTR karti `Kur` aksiyonu ile acilir;
- form yalniz istenen uc credential ve test modu kontrolunu gosterir;
- callback URL kopyalanabilir ve store hostname'e aittir;
- basarili save sonrasi polling terminal durumu gosterir;
- aktif test PayTR storefront checkout'ta tek kart yontemi olarak gorunur;
- PayTR hosted iframe presentation acilir;
- imzali test callback'i tek attempt ve tek siparis sonucu uretir;
- 390, 768 ve 1440 px'te overflow, blank state veya fatal console hatasi yoktur;
- DOM, console, network log ve screenshot'larda raw credential yoktur.

## Kabul Kriterleri

1. Merchant PayTR kartinda `Hazirlaniyor` engeli gormez ve kurulumu baslatabilir.
2. Form referanstaki sadeligi korur: test modu, uc alan, callback, panel linki ve
   tek kaydet butonu.
3. Her magaza yalniz kendi credential'ini kullanir; store-specific hardcode veya
   ortak PayTR env credential'i yoktur.
4. Credential'lar sealed saklanir ve browser'a geri donmez.
5. Basarili provider dogrulamasi profil ve payment method'u gercekten aktif
   yapar; UI sahte basari gostermez.
6. Aktif PayTR storefront checkout'ta hosted kart yontemi olarak gorunur ve
   provider iframe'ine guvenli gecis yapar.
7. Sabit PayTR callback route'u HMAC, amount, currency, attempt ve idempotency
   kontrollerini korur.
8. Test modu `test_mode=1`, live modu `test_mode=0` olarak exact provider
   request'ine gider.
9. Yanlis credential aktif yontem uretmez; gecici provider hatasi veri kaybi
   veya sahte reject uretmez.
10. Banka havalesi, kapida odeme, iyzico ve mevcut checkout davranislari
    gerilemez.

## Rollout

1. Kod ve migration disposable PostgreSQL ortaminda dogrulanir.
2. PayTR platform build/evidence authority staging icin uretilir ve review
   edilir.
3. Customer-panel, owner worker ve storefront ayni exact SHA ile Güzide staging
   ortamlarina alinir.
4. Merchant credential'i yalniz yeni formdan magaza sahibi tarafindan girilir;
   donor WordPress ekranindan otomatik tasinmaz.
5. Test modu save, worker validation, method activation, checkout iframe,
   callback ve siparis sonucu smoke edilir.
6. Rollback'te yeni PayTR baslatma kapatilir; mevcut attempt callback ve
   reconciliation tamamlanmaya devam eder.
7. Canli moda gecis merchant'in PayTR hesabinin live token kabul etmesi ve
   staging acceptance tamamlanmasindan sonra acilir.

## Kapsam Disi

- PayTR Direct API veya Celebix'in kart verisi topladigi bir form;
- refund, partial refund, cancel veya capture yonetim UI'si;
- merchant credential'larini WordPress'ten otomatik okuma/tasima;
- provider sirlarini Coolify ortak env'ine yazma;
- bir magazada ayni anda birden fazla aktif hosted kart provider'i;
- PayTR disindaki katalog kartlarini bu teslimatta yeniden tasarlama;
- canli para tahsilati veya production deploy'u tasarim onayi sayma.

## Kaynaklar

- PayTR iFrame API: https://dev.paytr.com/en/iframe-api
- PayTR iFrame API Step 1: https://dev.paytr.com/iframe-api/iframe-api-1-adim
- PayTR iFrame callback: https://dev.paytr.com/iframe-api/iframe-api-2-adim
