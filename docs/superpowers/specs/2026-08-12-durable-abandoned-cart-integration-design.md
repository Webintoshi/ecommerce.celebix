# Durable Abandoned Cart Integration Design

## Status

Kullanıcı tarafından 12 Ağustos 2026 tarihinde yazılı olarak onaylandı.

## Goal

Gerçek storefront sepetini kalıcı terk-sepet yönetimine atomik biçimde bağlamak; ürün sepete eklendiği anda mağaza yöneticisinin aktif sepeti görebilmesini, hareketsiz sepetin güvenilir biçimde terk edilmiş sayılmasını ve tamamlanan siparişin aynı kayıt üzerinde doğru kapanmasını sağlamak.

## Confirmed root cause

- Güncel storefront, `saas.storefront_carts`, `saas.storefront_cart_credentials` ve `saas.storefront_cart_items` tablolarını kullanır.
- Yönetim panelindeki terk-sepet ekranı ayrı `saas.abandoned_carts` ve `saas.abandoned_cart_items` projeksiyonunu okur.
- Storefront cart client gerçek kullanımda `/api/cart/capture` çağırmaz; bu nedenle projeksiyon hiç oluşmaz.
- Eski capture akışının düz base64url credential formatı, güncel `c1.<keyId>.<token>` cart cookie formatıyla uyumsuzdur. İstemciye yalnız ek bir capture çağrısı koymak güvenilir bir düzeltme değildir.
- `abandoned_carts_mark_stale` fonksiyonu vardır fakat onu üretim akışında çağıran worker veya server-side reconciliation yoktur.
- `public_checkout_complete` durable sepeti `converted` yapar fakat terk-sepet kaydını aynı siparişle kapatmaz.

## Authority decision

`saas.storefront_carts` tek sepet yetki kaynağı olarak kalır. `saas.abandoned_carts` mağaza yöneticisi için server-owned, immutable catalog snapshot içeren bir yönetim projeksiyonudur.

Browser aşağıdaki alanlarda yetki kazanmaz:

- mağaza veya tenant kimliği;
- fiyat, indirim ve toplam;
- ürün/variant adı ve görseli;
- cart lifecycle durumu;
- abandoned/recovered zamanı;
- sipariş bağlantısı;
- credential digest veya recovery sonucu.

Projeksiyon yalnız PostgreSQL içindeki durable cart, credential, catalog, price ve order kayıtlarından üretilir. Raw cart credential hiçbir tabloya, loga veya admin cevabına yazılmaz; yalnız mevcut SHA-256 digest kullanılır.

## Transactional bridge

Yeni migration, durable cart değişikliklerinin commit edildiği transaction içinde çalışan deferred constraint trigger'lar kurar.

- `storefront_carts` insert/status update olayları header lifecycle'ını projekte eder.
- `storefront_cart_items` insert/update/delete olayları transaction sonundaki nihai sepet içeriğini projekte eder.
- Deferred execution aynı mutation içindeki ara satır durumlarının admin projeksiyonuna sızmasını engeller.
- Aynı store/cart için advisory transaction lock ve unique source binding, eşzamanlı mutation'larda tek projeksiyon otoritesi sağlar.
- Yeni nullable `source_cart_id` bağı, legacy capture kayıtlarını bozmadan durable cart kaynaklı kayıtları açıkça ayırır.
- Durable cart kayıt kimliği aynı abandoned-cart kimliği olarak kullanılabilir; source binding yine de açık foreign key ve tenant-scoped uniqueness sağlar.

## Lifecycle

### Active capture

- İlk başarılı `add` mutation'ında, en az bir ürün varsa abandoned-cart projeksiyonu `active` olarak oluşur.
- Sonraki add/quantity/remove işlemleri aynı projeksiyonu ve item snapshot'ını günceller.
- Fiyatlar cart item'daki server-authoritative effective price'tan; ad, SKU ve medya catalog tablolarından alınır.
- İletişim bilgisi henüz yoksa kayıt `Anonim sepet` olarak kalır; görünürlük için browser kimliği uydurulmaz.
- Sepet tamamen boşaltıldığında tamamlanmamış aktif projeksiyon arşivlenir ve terk metriklerine girmez.

### Inactivity

- Yönetim panelinin list/summary/get authority çağrıları, aynı store için deterministic reconciliation çalıştırır.
- `last_activity_at <= now - 30 minutes` olan `active` kayıt `abandoned` olur.
- Kayıt mağaza listesinde oluşturulduğu anda `active` olarak görünür; kullanıcı 30 dakika beklemeden sistemin yakaladığını doğrulayabilir.
- Daha önce abandoned olmuş durable sepette yeni geçerli mutation gerçekleşirse kayıt yeniden `active` olur, `abandoned_at` temizlenir ve yanlışlıkla `recovered` sayılmaz.

### Conversion

- Checkout aynı cart'ı başarıyla siparişe çevirdiğinde deferred bridge `storefront_checkout_operations` içindeki gerçek order id'yi kullanır.
- Önceden `abandoned` olan sepet `recovered` olur ve `recovered_order_id` bağlanır.
- Henüz `active` olan sepet `archived` olur ve gerçek order id bağlanır; terk/kurtarma metriğini yapay olarak büyütmez.
- Checkout başarısız veya rollback olursa projeksiyon da değişmez.

### Merchant archive

Mevcut merchant archive ve optimistic version authority korunur. Yönetici tarafından arşivlenmiş kayıt, daha sonraki browser trafiğiyle sessizce yeniden açılamaz.

## Admin behavior

- Mevcut `/orders/abandoned-carts` listesi ve ayrıntı ekranı korunur.
- Yeni sepet anında `Aktif`, anonim ve gerçek item snapshot'ıyla görünür.
- 30 dakikalık eşik aşıldığında aynı kayıt `Terk edildi` olur.
- Arama ve müşteri bilgileri yalnız mevcut, doğrulanmış customer snapshot mevcutsa kullanılır.
- Manuel `Kurtarıldı olarak işaretle` ve archive eylemleri mevcut authority ile çalışmaya devam eder; otomatik order conversion gerçek order bağını kullanır.

## Failure and rollback behavior

- Abandoned projection trigger'ındaki herhangi bir hata cart mutation transaction'ını rollback eder; storefront başarı gösterip admin kanıtını kaybetmez.
- Duplicate/replayed cart operation yeni duplicate abandoned record oluşturmaz.
- Tenant B hiçbir koşulda tenant A cart, digest, item veya order kaydını göremez ya da bağlayamaz.
- Migration rollback trigger'ları ve source binding'i kaldırır; mevcut durable cart ve legacy abandoned history tablolarını silmez.

## Verification

- İlk add ile tek `active` row ve doğru item/price/media snapshot.
- Quantity ve remove ile aynı row/version ve doğru toplam.
- Empty cart ile archive.
- 29:59 hareketsizlikte active; 30:00 eşiğinde abandoned.
- Abandoned cart mutation ile active dönüşü, recovered metriğinin değişmemesi.
- Abandoned checkout completion ile recovered + exact order id.
- Active checkout completion ile archived + exact order id.
- Rollback, replay, concurrent mutation ve cross-store isolation.
- Raw credential/cookie/secret taraması.
- Migration assertion, backup/restore, rollback/reapply ve PostgreSQL 16 disposable harness.
- Storefront cart/checkout, abandoned-cart admin, customer-panel ve storefront regressionları.

## Deferred scope

Otomatik e-posta/SMS pazarlama, consent yönetimi ve tek kullanımlık recovery link üretimi bu onarımın parçası değildir. Güvenilir cart lifecycle ve müşteri iletişim authority'si tamamlandıktan sonra ayrı, açıkça yetkilendirilmiş bir görev olarak eklenmelidir.

