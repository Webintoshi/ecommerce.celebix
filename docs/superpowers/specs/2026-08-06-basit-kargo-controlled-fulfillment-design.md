# Basit Kargo Kontrollü Gönderi Otomasyonu Tasarımı

**Durum:** Yaklaşım ve kullanıcı akışı 2026-08-06 tarihinde kullanıcı tarafından onaylandı; yazılı spesifikasyon kullanıcı incelemesini bekliyor.

**Tasarım tabanı:** `ded9016e`

**Sağlayıcı sırası:** Basit Kargo → ShipEntegra → Geliver

**Hedef yüzeyler:**

- `packages/saas-contracts`
- `packages/saas-data`
- yeni server-only `packages/shipping-adapters` paketi
- `apps/customer-panel`
- `apps/storefront-shared`
- `apps/owner/scripts/sql/saas`
- tenant etiket varlıkları için mevcut R2 medya geçidi

## 1. Amaç

Celebix mağaza yöneticisi, sipariş detayından Basit Kargo'nun gerçek fiyatlarını görüp taşıyıcıyı kendisi seçerek gönderi, barkod ve yazdırılabilir etiket oluşturabilecektir. Oluşan takip bilgisi siparişe bağlanacak; gönderi durumu sağlayıcıdan doğrulanarak güncellenecek ve müşteri kendi mağazasının sipariş yüzeyinde gerçek takip durumunu görebilecektir.

Her mağaza kendi Basit Kargo hesabını ve Bearer token'ını kullanır. Celebix hiçbir mağazanın kargo sözleşmesini başka bir mağazayla paylaşmaz. Token yalnız server-side şifreli yetki olarak tutulur; tarayıcıya, RSC prop'una, loga, analitiğe veya hata metnine çıkmaz.

İlk kullanıcı deneyimi kontrollü otomasyondur:

1. yönetici paket bilgilerini kontrol eder;
2. gerçek fiyat listesini ister;
3. firma, `ECONOMIC` veya `FAST` seçeneğini seçer;
4. açık onaydan sonra barkod oluşturulur;
5. etiket, takip ve durumlar panelden yönetilir.

Bu çalışma ShipEntegra veya Geliver adaptörünü henüz çalıştırmaz; fakat ortak sözleşme ve veri modeli bu iki sağlayıcı için yeniden sipariş kodu yazılmasını gerektirmeyecek şekilde kurulur.

## 2. Resmî Basit Kargo sözleşmesi

2026-08-06 tarihinde `https://basitkargo.com/api` üzerinde doğrulanan public sözleşme şunları sağlar:

- HTTPS ve `Authorization: Bearer <token>` kimlik doğrulaması;
- token başına dakikada 120 istek ve `429` yanıtında `Retry-After` başlığı;
- aktif kargo firmaları;
- desi/kg veya paket ölçüleriyle fiyat sorgusu;
- `POST /v2/order/barcode` ile sipariş ve barkod oluşturma;
- `ECONOMIC`, `FAST` ve `SELF_*` taşıyıcı kodları;
- siparişi ID, barkod veya takip numarasıyla sorgulama;
- şubeye teslim edilmemiş barkodu iptal etme;
- teslim edilmiş gönderi için iade barkodu oluşturma;
- SVG etiket indirme;
- marka ve gönderici adresi listeleri;
- durum değişikliği ve kargo hareketi webhook'ları;
- `NEW`, `READY_TO_SHIP`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `NEEDS_SUPPORT`, `DELAYED`, `RETURNING`, `RETURNED` ve `LOST` durumları;
- nakit veya kredi kartı kapıda tahsilat bilgisi.

Public doküman bir provider idempotency header'ı, webhook imzası veya webhook secret doğrulama biçimi tanımlamaz. Bu yüzden tasarım:

- gönderi oluşturmayı ağ hatasında kör biçimde tekrarlamaz;
- webhook gövdesini sipariş gerçeği kabul etmez;
- webhook'u yalnız doğrulama işi başlatan sınırlı bir sinyal sayar;
- terminal durum ve kapıda ödeme değişikliğini Bearer token ile yapılan provider sorgusundan sonra uygular.

## 3. Mevcut Celebix durumu

Kod tabanında bugün:

- sipariş detayında adres ve manuel `carrier`, `trackingNumber`, `trackingUrl`, `shippedAt` kaydı vardır;
- kargo değişikliği tenant bağlamı, operation ID ve optimistic version ile PostgreSQL fonksiyonundan geçer;
- sipariş listesi teslimat durumuna göre filtrelenebilir;
- panelde kalıcı fakat yürütme yetkisi olmayan temel kargo ayarı bulunur;
- R2 varlık geçidi tenant namespace, doğrulanmış yükleme ve server-owned public metadata sınırına sahiptir;
- provider profilleri için sealed credential, version, rotation, revoke, queue lease, unknown-outcome ve reconciliation kalıpları vardır;
- işlevsel olgunluk kaydı `shipping_rate_runtime` ile `shipping_labels` yeteneklerini açık eksik sayar.

Yeni özellik mevcut manuel takip yolunu kaldırmaz. Basit Kargo bağlantısı kapalı veya geçici olarak erişilemez olduğunda yönetici manuel takip eklemeye devam edebilir.

## 4. Değerlendirilen yaklaşımlar

### A — Basit Kargo çağrılarını doğrudan sipariş modülüne gömmek

Reddedildi. İlk ekran hızlı çıkar; ancak provider payload, hata, credential ve durum eşleme kodu sipariş domainine sızar. ShipEntegra ve Geliver eklenirken aynı güvenlik ve yaşam döngüsü tekrar yazılır.

### B — Kargo sistemini genel uygulama mağazası işi olarak ele almak

Reddedildi. Kurulum kataloğu için kullanılabilir fakat gönderi üretme, order item miktarı, tracking ve COD ödeme geçişi sipariş domaininin atomik otoritesine ihtiyaç duyar. Genel uygulama kaydı tek başına bu işi tamamlamaz.

### C — Ortak kargo çekirdeği ve server-only provider adaptörleri

Seçilen yaklaşımdır. Celebix ortak gönderi, teklif, etiket, takip ve reconciliation yaşam döngüsünü sahiplenir. Basit Kargo adaptörü yalnız resmî API şekillerini ortak sonuca çevirir. ShipEntegra ve Geliver daha sonra aynı adaptör sözleşmesini uygular.

## 5. Değişmez kurallar

1. Store ve tenant kimliği yalnız doğrulanmış panel oturumu veya güvenilir storefront hostname üzerinden çözülür.
2. Browser store ID, tenant ID, provider profile ID, encrypted credential, provider order ID veya callback otoritesi gönderemez.
3. Her mağaza kendi provider profilini ve token'ını kullanır.
4. Token şifrelenmiş envelope olarak saklanır; plaintext yalnız kısa ömürlü server worker belleğinde açılır.
5. Fiyat sorgusu ücretli gönderi oluşturmaz.
6. Gönderi yalnız açık yönetici onayı ve `orders.fulfill` yetkisiyle başlar.
7. Provider network çağrısı PostgreSQL row lock veya açık transaction sırasında yapılmaz.
8. Aynı operation/fingerprint tekrarı aynı kalıcı sonucu döndürür; farklı payload aynı operation ID ile reddedilir.
9. Provider oluşturma sonucu belirsizse otomatik ikinci `POST /v2/order/barcode` yapılmaz.
10. Webhook tek başına durum, teslimat veya ödeme gerçeği değildir.
11. Kapıda ödeme yalnız doğrulanmış `DELIVERED` sonucu, doğru order/payment kind ve mağazanın açık ayarıyla tamamlanır.
12. Basit Kargo arızası sipariş, ödeme, manuel takip veya storefront checkout'u kullanılamaz yapmaz.
13. Label dosyası çalıştırılabilir içerik gibi sunulmaz; doğrulanan SVG ayrı attachment/sandbox politikasıyla teslim edilir.
14. Sipariş ve gönderi olayları append-only denetim geçmişi üretir.
15. Sağlayıcı başarı iddiası yalnız doğrulanmış provider cevabı veya doğrulanmış read-back sonucu ile gösterilir.

## 6. Domain ve veri modeli

Additive PostgreSQL migration mevcut sipariş tablolarını yeniden anlamlandırmadan aşağıdaki private otoriteyi ekler.

### 6.1 `shipping_provider_definitions`

Server-owned finite katalog:

- `provider_code`: ilk değer `basit_kargo`;
- `display_name`, `capability_version`;
- desteklenen özellikler: quote, shipment, label, cancel, return, tracking, COD;
- `enabled` ve environment;
- adapter/build sürümü.

Uygulama rolü tabloyu doğrudan okuyamaz. Public provider listesi yalnız güvenli katalog projeksiyonundan gelir.

### 6.2 `shipping_provider_profiles`

Tenant'a ait bağlantı:

- `id`, `store_id`, `provider_code`;
- `status`: `pending`, `active`, `disabled`, `revoked`, `attention_required`;
- encrypted credential envelope, key ID, credential digest ve credential version;
- doğrulanmış provider account identity digest;
- seçilen provider `brand_id` ve `address_id` için private binding;
- COD teslimatta ödeme onayı tercihi;
- row version ve timestamps.

Safe panel projeksiyonu yalnız bağlantı durumu, son doğrulama zamanı, seçili marka/adres etiketi ve yetenekleri gösterir. Token, provider internal ID ve envelope authority gösterilmez.

Token değişikliği credential version'ı artırır, açık execution lease'lerini geçersiz kılar ve profil tekrar doğrulanana kadar yeni gönderiyi durdurur. Revoke terminaldir; tekrar bağlantı yeni profile/credential authority üretir.

### 6.3 `shipping_provider_resources`

Başarılı bağlantı testi sırasında okunan marka, gönderici adresi ve handler kaynaklarının sınırlı cache'i:

- store/profile/credential version bağı;
- provider resource kind ve opaque provider resource ID;
- güvenli display label;
- canonical digest ve son doğrulama zamanı;
- aktif/pasif durumu.

Adresin tam private içeriği browser katalog listesine kopyalanmaz. Yönetici yalnız kendi profilinin safe label'larını seçer. Her gönderide seçili resource current credential ile provider'dan yeniden doğrulanabilir.

### 6.4 `shipping_quote_sessions` ve `shipping_quote_options`

Bir quote session:

- store, order, order version ve profile/credential version'a bağlıdır;
- server-derived recipient, remaining order items, package list, COD ve currency digest'i taşır;
- on dakikalık sabit expiry kullanır;
- `quoted`, `expired`, `consumed` durumlarına sahiptir;
- public opaque quote credential digest'iyle browser seçimine bağlanır.

Her option yalnız normalize edilmiş handler code/name, desi/kg, tahmini ücret, COD ücreti ve para birimini içerir. Basit Kargo resmî API'si imzalı quote ID veya fiyat garantisi vermediği için panel ücretin anlık/tahmini olduğunu açıkça belirtir. Browser fiyat veya handler ayrıntısı üretmez; yalnız server'ın verdiği opaque option ID'sini geri gönderir.

### 6.5 `shipments` ve `shipment_items`

Her gönderi:

- store ve order composite foreign key;
- provider profile, credential version ve provider code;
- quote session/option ve create operation bağı;
- server-generated unique provider reference code;
- provider shipment ID, barcode, handler code/name, tracking number ve güvenli tracking URL;
- provider ve Celebix normalize durumları;
- shipping/COD para değerleri minor-unit olarak;
- immutable recipient/package request digest'i ve private snapshot;
- `draft`, `creating`, `ready`, `shipped`, `out_for_delivery`, `delivered`, `delayed`, `returning`, `returned`, `lost`, `cancelled`, `provider_outcome_unknown`, `attention_required` durumları;
- row version, timestamps ve terminal facts.

`shipment_items`, order item ID ve gönderilen adet bağını taşır. İlk UI tüm kalan ürünleri tek gönderiye koyar; şema daha sonra parçalı gönderiyi veri taşıma olmadan açabilir. Aynı order item toplam shipment miktarı sipariş miktarını aşamaz.

### 6.6 İşler, olaylar ve operasyonlar

- `shipping_jobs`: validate, quote, create, refresh, cancel, return ve label işleri; lease/fence/attempt/next-run otoritesi.
- `shipping_events`: provider gözlemi, normalize durum, digest ve gerçekleşme zamanı; append-only.
- `shipping_operations`: browser/worker komutlarının immutable fingerprint ve safe sonuç kaydı.
- `shipping_webhook_observations`: bounded body digest, provider binding ve receive time; ham PII payload kalıcı tutulmaz.
- `shipping_labels`: R2 object binding, SHA-256 digest, MIME, byte size ve version; raw SVG veritabanında tutulmaz.

Application ve workflow rolleri tablolarda doğrudan DML yapamaz. App yalnız tenant-scoped SECURITY DEFINER komutlarını, workflow yalnız lease-bound provider fonksiyonlarını çalıştırabilir.

## 7. Provider adaptörü

Ortak server-only adaptör şu finite işlemleri tanımlar:

- `verifyCredential`;
- `listBrands`;
- `listSenderAddresses`;
- `listHandlers`;
- `quotePackages`;
- `createShipment`;
- `getShipment`;
- `cancelShipment`;
- `createReturnShipment`;
- `downloadLabel`.

Adaptör:

- yalnız `https://basitkargo.com/api` exact origin'ine çıkar;
- redirect takip etmez veya yalnız exact origin aynı-path politikasıyla takip eder;
- connect/read/body timeout ve response byte sınırı uygular;
- JSON'u exact finite parser ile doğrular;
- HTML, beklenmeyen content type, aşırı büyük cevap ve unknown alanları güvenli provider hatasına çevirir;
- Authorization başlığını, token'ı, alıcı PII'sini ve raw provider cevabını loglamaz;
- `429` için doğrulanmış `Retry-After` değerini bounded retry sonucuna çevirir;
- 4xx terminal validation, 401/403 credential invalid, 429 throttled, 5xx/timeout temporary veya unknown outcome ayrımını korur.

Basit Kargo için `createShipment`, `POST /v2/order/barcode` kullanır. Dokümante idempotency anahtarı bulunmadığı için timeout/connection reset sonrası job `provider_outcome_unknown` olur. Aynı POST otomatik tekrarlanmaz. Worker önce sağlayıcının güvenli sorgu/list endpoint'lerinden server-generated reference ile exact tek eşleşme kanıtlamaya çalışır. Kesin tek eşleşme kanıtlanamazsa yöneticiye “Basit Kargo'da kontrol gerekli” durumu gösterilir; ikinci gönderi yalnız önceki sonucun oluşmadığı kanıtlandıktan sonra yeni operation ile başlatılabilir.

## 8. Bağlantı akışı

`Ayarlar → Kargo` sayfası genel metin formu yerine gerçek kargo çalışma alanı olur.

1. Yönetici Basit Kargo kartında “Bağla” seçer.
2. Token password alanından aynı-origin POST ile gönderilir.
3. Server token formatını sınırlar, encrypt eder ve pending profile oluşturur.
4. Workflow exact credential version ile `/handlers`, `/firm/brand` ve `/firm/address` çağrılarını yapar.
5. Başarıda safe resource listeleri kaydedilir; token browser'a geri dönmez.
6. Yönetici varsayılan marka ve gönderici adresini seçer.
7. Aktif profil ancak credential doğrulanmış ve seçilen kaynaklar current ise gönderi oluşturabilir.
8. Token değiştirme ve bağlantı kaldırma ayrı, onaylı, versioned işlemlerdir.

Panel kısa durumlar kullanır: `Bağlı`, `Kurulum gerekli`, `Kontrol ediliyor`, `Yeniden bağla`. Uzun açıklama ve sahte başarı metni kullanılmaz.

## 9. Kontrollü gönderi akışı

### 9.1 Teklif

1. Yönetici sipariş detayında “Gönderi oluştur” seçer.
2. Server order, items, shipping address, payment method, order version ve fulfill capability'yi yeniden okur.
3. İlk UI kalan tüm adetleri seçer; yönetici paket sayısı, en/boy/yükseklik/ağırlık değerlerini girer.
4. Server canonical package ve order digest'i oluşturur.
5. Quote job Basit Kargo fiyat endpoint'ini çağırır.
6. Exact finite sonuçlar on dakikalık quote session'a kaydedilir.
7. Panel firma, desi/kg, tahmini ücret ve COD ek ücretini sade bir liste olarak gösterir.

Quote alınması sipariş durumunu, stoğu, ödemeyi veya provider shipment'ı değiştirmez.

### 9.2 Onay ve barkod

1. Yönetici server-issued opaque option ID'sini seçip “Barkod oluştur” der.
2. PostgreSQL quote expiry, order/version, remaining quantities, provider profile/credential, selected brand/address ve operation fingerprint'i doğrular.
3. `creating` shipment, shipment items ve create job atomik yazılır.
4. Transaction kapandıktan sonra worker credential'ı açıp provider çağrısını yapar.
5. Başarı sonucu shipment'a provider ID, barkod, handler ve takip gerçekleri olarak kaydedilir.
6. Sipariş tracking projeksiyonu provider shipment gerçeğinden güncellenir; manuel alan provider gerçeğini ezemez.
7. Label işi SVG'yi indirir, boyut/MIME/SVG güvenlik doğrulamasından geçirir ve tenant R2 namespace'ine yazar.
8. UI kısa polling veya server refresh ile `Hazırlanıyor` durumundan `Etiketi yazdır` durumuna geçer.

Bir order için birden fazla shipment şemada mümkündür; ilk UI önceki aktif gönderi iptal edilmeden aynı kalan adetler için ikinci gönderi başlatmaz.

## 10. Durum, webhook ve reconciliation

Basit Kargo → Celebix eşlemesi:

- `NEW`, `READY_TO_SHIP` → `ready`;
- `SHIPPED` → `shipped`;
- `OUT_FOR_DELIVERY` → `out_for_delivery`;
- `DELIVERED` → `delivered`;
- `DELAYED` → `delayed`;
- `RETURNING` → `returning`;
- `RETURNED` → `returned`;
- `LOST` → `lost`;
- `NEEDS_SUPPORT` → `attention_required`.

Public webhook endpoint provider profile için yüksek entropili opaque binding kullanır; exact method, content type ve body byte sınırı uygular. Kabul edilen payload:

- yalnız digest ve bounded routing facts olarak kaydedilir;
- shipment/order durumunu doğrudan değiştirmez;
- exact profile/credential ile `getShipment` refresh işi oluşturur;
- aynı gözlem digest'ini idempotent tekrar sayar.

Worker Bearer token ile provider shipment'ı okuduktan sonra monotonic durum geçişi uygular. Eski veya çelişkili provider cevabı var olan terminal gerçeği geri alamaz. Polling de webhook kaçırılmasına karşı yalnız aktif shipment'lar için bounded periyotlarla çalışır; token başına 120/dakika limitini aşmaz.

## 11. Kapıda ödeme

Otomatik ödeme onayı varsayılan olarak kapalıdır. Açık olduğunda bile yalnız şu koşulların tamamı geçerliyse çalışır:

- provider refresh sonucu exact shipment için doğrulanmış `DELIVERED`;
- order payment method `cash_on_delivery`;
- order payment durumu hâlâ `pending` veya izin verilen eşdeğeri;
- shipment COD amount/type order'ın immutable tahsilat otoritesiyle eşleşiyor;
- shipment/order/store bağı exact;
- aynı delivery event/operation daha önce uygulanmamış.

Tek transaction payment status'u tamamlar ve append-only order event yazar. Webhook gövdesi, takip sayfası veya yönetici browser girdisi bu geçişi tek başına yapamaz.

## 12. İptal, iade ve etiket

- Barkod iptali yalnız provider ve shipment durumunun henüz taşıyıcıya teslim edilmediğini doğruladığı aşamada kullanılabilir.
- İptal sonucu bilinmiyorsa shipment iptal edilmiş gösterilmez; reconciliation gerekir.
- Teslim edilmiş gönderide yönetici “İade kodu oluştur” seçebilir.
- İade ayrı incoming shipment olarak kaydedilir ve orijinal gönderiye bağlanır.
- İade barkodu ürün stoğunu otomatik artırmaz. Stok yalnız ayrı, açık ve doğrulanmış iade kabul iş akışında değişir.
- SVG etiket same-origin authenticated download route üzerinden `Content-Disposition: attachment` ile sunulur; R2 private object key'i browser'a çıkmaz.

## 13. Panel ve storefront deneyimi

### Panel

`/settings/shipping`:

- Basit Kargo bağlantı durumu;
- token bağla/değiştir/kaldır;
- varsayılan marka ve gönderici adresi;
- teslimatta COD onayı;
- son doğrulama ve eylem gerektiren kısa durum.

`/orders/[orderId]`:

- mevcut manuel takip bölümü korunur;
- aktif bağlantıda “Gönderi oluştur”;
- paket ölçü formu;
- gerçek teklif listesi ve tek seçim;
- barkod/taşıyıcı/takip/etiket;
- durum zaman çizelgesi;
- uygun durumda iptal veya iade kodu.

UI, Celebix panelinin mevcut sade ve kutusuz sunumuna uyar. Sayfa başlığı tekrarlanmaz; açıklama yalnız işlem için zorunlu olduğunda gösterilir. Mobilde fiyat seçenekleri erişilebilir radio kartları, masaüstünde yoğun bir tablo olabilir.

### Storefront

- Müşteri hesabındaki sipariş detayı güvenli taşıyıcı adı, takip numarası, mevcut durum ve doğrulanmış hareketleri gösterir.
- Misafir receipt credential aynı sipariş takip projeksiyonuna erişebilir.
- Provider internal shipment ID, profil, token veya R2 object key gösterilmez.
- Gönderi oluşturuldu ve gönderildi/tahmini teslim olayları mevcut transactional notification outbox'ına güvenli event olarak yazılır. Çalışan teslimat adaptörü yoksa mesaj gönderildi denmez; event bekleyen/başarısız durumuyla kalır.

## 14. HTTP ve yetki sınırları

Panel route'ları exact same-origin ve authenticated handler'lardır. Browser payload'ları yalnız operation ID, expected version, paket ölçüleri ve server-issued opaque seçim credential'larını taşıyabilir.

Beklenen route aileleri:

- provider bağlantı current/save/rotate/revoke;
- provider kaynak listesi ve varsayılan seçim;
- order shipping quote begin/current;
- shipment create/current;
- label download;
- shipment cancel;
- return shipment create;
- provider webhook signal.

Her mutation rol/capability, CSRF/origin, content type, body size, exact keys, operation replay ve optimistic version kontrolü yapar. Response'lar `Cache-Control: no-store` kullanır. Provider ve database iç hataları finite public kodlara dönüşür.

## 15. Hata ve kurtarma davranışı

- **Token geçersiz:** profil aktif olmaz; önceki working credential rotate işlemi tamamlanana kadar korunur.
- **Marka/adres eksik:** bağlantı `setup_required`; quote görülebilir olsa bile gönderi oluşturulamaz.
- **Adres/paket eksik:** provider çağrısından önce alan bazlı validation.
- **Quote süresi dolmuş:** yeni teklif alınır; eski seçim kullanılamaz.
- **429:** `Retry-After` kadar bounded bekleme; manuel tekrar düğmesi yeni provider POST üretmez.
- **Kesin provider reddi:** shipment `attention_required` veya terminal validation sonucu; güvenli hata gösterilir.
- **Create timeout/connection reset:** `provider_outcome_unknown`; kör tekrar yok.
- **Webhook çelişkisi:** durum değişmez; provider read-back işi ve audit gözlemi oluşur.
- **Provider outage:** mevcut sipariş, ödeme ve manuel kargo akışları çalışır.
- **R2 label yazma hatası:** gönderi gerçeği korunur; label ayrı idempotent işle yeniden indirilebilir.
- **Commit unknown:** operation lookup ile read-only recovery; provider mutation tekrar edilmez.

## 16. Test ve kanıt planı

### Statik ve sözleşme testleri

- provider DTO exact parser'ları ve finite durum eşlemesi;
- browser/client graph'ta credential ve private authority bulunmaması;
- exact Basit Kargo origin, timeout, redirect, response size ve log redaction;
- label SVG güvenlik ve attachment başlıkları;
- ShipEntegra/Geliver eklenebilir ortak adaptör sözleşmesi.

### PostgreSQL 16 disposable harness

- profile save/rotate/revoke ve tenant izolasyonu;
- forced RLS, exact ACL ve function-only runtime authority;
- quote expiry ve opaque option binding;
- aynı operation replay/fingerprint mismatch;
- eşzamanlı shipment create için tek durable iş;
- provider outcome unknown sonrası ikinci POST engeli;
- shipment item miktar sınırı;
- webhook observation idempotency;
- monotonic durum geçişleri;
- COD delivered atomik ödeme geçişi ve yanlış yöntem reddi;
- cancel/return ve label binding;
- backup/restore, guarded rollback ve reapply.

### Runtime testleri

- Basit Kargo fixture server ile başarı, 4xx, 401, 429, 5xx, timeout, malformed JSON, oversized body ve redirect;
- gerçek handler → repository → worker → adapter → finalize zinciri;
- unknown provider create sonucunda kör retry olmaması;
- label R2 yazma ve tekrar indirme;
- public order tracking projeksiyonunda secret bulunmaması.

### UI ve tarayıcı testleri

- bağlantı boş/kurulum/aktif/hata/rotate/revoke durumları;
- teklif al, seç, onayla, hazırlanıyor, etiket ve takip akışı;
- çift tıklama ve sayfa yenileme;
- manuel takip fallback'i;
- mobile/desktop, keyboard, focus, error ve reduced-motion davranışı.

Gerçek Basit Kargo hesabı ve token'ı sağlanmadıkça dış sağlayıcı başarısı iddia edilmez. Varsayılan testler network kapalı fixture ile çalışır. Gerçek provider kabul testi ayrı, opt-in, secret-free artifact üreten staging kapısıdır.

## 17. Yayınlama sırası

1. Common contracts ve provider-agnostic shipment state machine.
2. PostgreSQL profile, quote, shipment, job, event ve operation authority.
3. Basit Kargo server-only adapter ve fixture testleri.
4. Bağlantı ayarları ve gerçek credential validation.
5. Sipariş detayında controlled quote/create/label akışı.
6. Webhook signal, provider read-back ve polling reconciliation.
7. Storefront/account takip projeksiyonu ve transactional notification events.
8. Cancel, return ve COD delivered otomasyonu.
9. Güzide staging migration/build/regression.
10. Gerçek Basit Kargo token'ıyla opt-in pilot kanıtı.

Feature varsayılan olarak kapalıdır. Migration preflight, worker adapter build authority ve provider profile doğrulaması tamamlanmadan panel gönderi oluşturabileceğini iddia etmez. Güzide pilotu başarılı olduktan sonra aynı ortak çekirdeğe ShipEntegra, ardından Geliver adaptörü eklenir.

## 18. Kapsam dışı

- ShipEntegra ve Geliver network adaptörlerinin bu ilk dilimde çalıştırılması;
- Celebix'in mağaza adına kargo sözleşmesi satması veya ortak token kullanması;
- otomatik taşıyıcı seçip yönetici onayı olmadan ücretli gönderi oluşturma;
- checkout sırasında canlı kargo ücreti hesaplama;
- depo toplama rotası ve fulfillment location seçimi;
- uluslararası gümrük/IOSS/HMRC formları;
- iade barkodu oluşunca otomatik stok veya finansal refund;
- webhook payload'ını provider gerçeği sayma;
- gerçek provider token'ını source control, test fixture veya loga koyma;
- mevcut manuel kargo akışını kaldırma.

## 19. Başarı ölçütü

Özellik ancak aşağıdakilerin tamamı kanıtlandığında tamamlanmış sayılır:

- mağaza kendi token'ını güvenle bağlayabilir ve kaynaklarını doğrulayabilir;
- yönetici gerçek Basit Kargo fiyatlarını görüp açıkça bir seçim yapabilir;
- bir onay en fazla bir provider gönderisi üretir veya belirsiz sonucu güvenle durdurur;
- barkod, takip ve private R2 etiketi kalıcı ve tenant-isolated olur;
- doğrulanmış provider durumu sipariş ve müşteri takip yüzeyine yansır;
- COD otomasyonu yalnız doğrulanmış teslimatta çalışır;
- Basit Kargo arızası diğer commerce akışlarını bozmaz;
- tüm authority, concurrency, rollback, build ve browser testleri geçer;
- gerçek token yoksa sistem ve teslim raporu provider başarısı iddia etmez.
