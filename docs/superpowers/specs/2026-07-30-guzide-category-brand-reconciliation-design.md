# Güzide kategori ve marka uzlaştırma tasarımı

Durum: Kullanıcı tarafından sözlü olarak onaylandı; yazılı spec incelemesi bekleniyor.

## Amaç

Güzide Kuyumcu'nun WordPress ürün taksonomisini mevcut Celebix staging mağazasına, ürün ve medya kayıtlarını yeniden içe aktarmadan doğru biçimde yansıtmak. Merchant arayüzündeki teknik kategori ve ürün slug gösterimleri kaldırılır; sluglar URL ve kalıcı veri otoritesi olarak içeride korunur.

## Kaynak ve mevcut durum

- Kaynak: `https://guzidekuyumcu.com.tr/wp-json/wp/v2/product_cat`
- WordPress kategorileri: 50 toplam, 14 üst, 36 alt kategori.
- Kaynak markalar: `product_brand` taksonomisinde 6 kayıt.
- Hedef mağaza: yalnız staging `guzide-kuyumcu-4`.
- Hedef ürünler: 1.628 kayıt.
- Hedef medya: 4.696 kayıt.
- Ürün-kategori ilişkileri: 3.177 kayıt.
- Marka ilişkileri: 1.587 kayıt; 1.568 farklı ürün en az bir markaya bağlı.

## Değişmezlik sınırları

Uzlaştırma sırasında aşağıdakiler değişmeyecek:

- ürün ve varyant kimlikleri, slugları, fiyatları, stokları, durumları ve sürümleri;
- ürün görselleri, R2 nesneleri, medya sırası ve medya ilişkileri;
- `saas.catalog_product_categories` satır kümesi;
- `saas.catalog_admin_resource_products` marka ilişki satır kümesi;
- marka kaynak kimlikleri ve kategori kimlikleri;
- Owner, storefront ve production verileri.

İşlem öncesi ve sonrası sayılarla sıralı ilişki özetleri karşılaştırılacak. Herhangi bir fark tüm işlemi başarısız sayacak.

## Kategori uzlaştırması

Mevcut 50 kategori korunur. Yalnız 36 alt kategori için:

1. WordPress `parent` ilişkisi mevcut Celebix üst kategori kimliğine çevrilir.
2. `Bileklikler > Şahmeran` gibi düzleştirilmiş görünen ad, `Şahmeran` olarak düzeltilir.
3. Mevcut dahili slug korunur; aynı mağazada slug benzersizliği bozulmaz.
4. Mevcut konum, durum ve ürün ilişkileri korunur.
5. Güncelleme, mevcut kategori mutation otoritesi üzerinden ve tek PostgreSQL transaction içinde yapılır.

Beklenen sonuç: 14 kök ve 36 çocuk; yetim, döngü veya sekiz seviyeyi aşan kayıt yoktur.

## Marka uzlaştırması

Mevcut altı marka ve tüm ürün ilişkileri korunur. WordPress kaynak adlarıyla karşılaştırılır; yalnız breadcrumb biçimindeki `KOÇAK > Koçak İmperium Koleksiyon` görünen adı `Koçak İmperium Koleksiyon` olarak normalize edilir. Marka slugı, kimliği ve 17 ürün ilişkisi değişmez.

Bu işlem yeniden ürün içe aktarımı değildir. Geçiş tamamlanana kadar aynı kaynak yeniden okunursa aynı kategori/marka durumu üretilir; yeni ürün, medya veya ilişki yazılmaz. Kesin geçişten sonra Celebix tek taksonomi otoritesidir.

## Merchant arayüzü

- Kategori listesinde slug satırı kaldırılır; hiyerarşik `Üst › Alt`, seviye ve sıra gösterimi kalır.
- Ürün listesinde başlığın altındaki `/urun-slug` kaldırılır.
- Ürün ayrıntı başlığında slug kaldırılır.
- Ürün düzenleme sırasında slug alanı gösterilmez; mevcut slug değişmeden mutation payload'a taşınır.
- Slug veritabanından, API sözleşmelerinden, URL üretiminden ve teknik içe aktarma doğrulamasından kaldırılmaz.

## Test ve kabul

1. UI testleri merchant yüzeyinde kategori ve ürün sluglarının render edilmediğini kanıtlar.
2. Ürün güncelleme testi görünmeyen mevcut slugın aynen korunduğunu kanıtlar.
3. Kategori ağacı testi 14 kök, 36 çocuk ve doğru breadcrumb etiketlerini kanıtlar.
4. Veri uzlaştırma öncesi/sonrası şu dört satır kümesinin sayı ve digest değerleri eşit olmalıdır: ürünler, medya, ürün-kategori ilişkileri, marka-ürün ilişkileri.
5. Staging PostgreSQL doğrulaması yetim/döngü olmadığını ve alt kategori sayısının 36 olduğunu kanıtlar.
6. Customer-panel test, typecheck ve build; `git diff --check`; secret taraması geçmelidir.
7. Yalnız customer-panel staging gerekli exact SHA ile deploy edilir ve `/products` ile `/products/categories` tarayıcıda doğrulanır.

## Yasaklar

- Ürün veya görselleri yeniden indirmek/yüklemek.
- R2 nesnesi yazmak veya silmek.
- Ürün-kategori ya da ürün-marka ilişkilerini yeniden üretmek.
- Production, DNS, Owner veya storefront deploy/mutation.
- WordPress'i kesin geçiş sonrasında kalıcı otorite olarak tutmak.
