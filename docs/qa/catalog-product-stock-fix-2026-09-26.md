# Ürün toplam stok gösterimi — 2026-09-26

Yayın kaynağı: `d56a01df675a79f99b03440baea7553dc20926ab`; dal: `codex/in-store-sales-register`.

**Durum:** SQL159 ve iki ortak admin yayını tamamlandı. Çalışan kaynak, dosya/binding eşleşmesi, sağlık ve canlı ürün listesi/filtre kontrolleri başarılı.

## Neden ve gerçek stok hareketi

Ürünler tablosu ürünün bütün aktif varyantlarının toplamı yerine, temsilci varyantın `stockQuantity` değerini gösteriyordu. Bu değer kendi varyantı için doğruydu; ürün toplamını ifade etmiyordu. Ürün detayındaki varyant toplamıyla liste arasındaki fark bu gösterimden kaynaklandı.

Siora'daki gerçek mağaza satışında L varyantından 1 adet satıldı. `12:42:26 UTC` tamamlaması `in_store_sale` hareketiyle stoku 1 azalttı; L global/depo stoku 0, diğer M/S varyantlarının toplamı 2 kaldı. Daha sonra `12:48 UTC` ayrı ve yetkili bir `catalog_adjustment +1` işlemi yapıldı. Düzeltme öncesi son canlı kontrolde L stoku 1, ürünün aktif takipli varyant toplamı 3'tür.

Bu yayın satış işlemini yeniden yürütmez; ikinci stok düşümü, stok onarımı veya veri geri doldurma işlemi içermez. Sonraki `+1` katalog hareketi, önceki satışın doğru stok düşümünden ayrı bir işlemdir.

## Değişiklik

- Yeni `catalog_list_products_v5`, temsilci varyantın SKU/barkod/fiyat ve ham stok değerlerini korur. `variantSummaries` girdisine ayrı `productStock={trackedVariantCount,untrackedVariantCount,trackedQuantity}` alanı ekler.
- Toplam yalnız aktif varyantlardan hesaplanır. Takipsiz varyantların sayısal stok alanı takipli toplama katılmaz. Karışık ürün `N adet + takipsiz`, tamamen takipsiz ürün `Takipsiz`, aktif varyantı olmayan ürün `—` olarak sunulur.
- Ürünler tablosu ve CSV ürün toplamını kullanır. Eski yanıtlarda mevcut gösterim korunur.
- Stok filtreleri sayfalama öncesinde ürün düzeyinde uygulanır: pozitif takipli toplam veya herhangi bir takipsiz varyant `in-stock`; herhangi bir takipsiz varyant `untracked`; takipli varyantı bulunan, takipsiz varyantı bulunmayan ve takipli toplamı 0 olan ürün `out-of-stock` olur. Aktif varyantı olmayan ürün bu üç filtreye girmez.
- Yeni `catalog_get_dashboard_summary_v2`, aynı sınıflandırmayla arşiv dışındaki `outOfStockProducts` sayısını ekler. Mevcut `outOfStockVariants` sayısı korunur; Stoksuz kartı yeni ürün sayısını tercih eder.
- Sayısal toplam önce PostgreSQL `numeric` ile hesaplanır. JavaScript güvenli tamsayı sınırını aşan değer başarısız sonuç üretir; yuvarlanmaz veya sınırda kesilmez.
- Önceki V4 ve dashboard işlevleri değişmedi. SQL önce uygulanıp yeni uygulama sonra yayımlanabilir. Yeni okuma yardımcıları özel; uygulama yalnız doğrulanmış iki yeni giriş işlevini çağırabilir.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Shared contracts | 365/365 |
| Data testleri | 671/671 |
| Sunucu katalog ve panel erişim testleri | 83/83 |
| UI, istemci ve gerçek React DOM regresyonları | 76/76 |
| Gerçek PostgreSQL 16 davranışları | 8/8 |
| Bağımsız SQL/contract/repository/runtime/UI incelemesi | Somut açık bulgu yok |

Gerçek PG testinde eksik V5 çağrısı önce `42883` ile RED oldu. SQL159 sonrası tamamlanan sentetik L satışı L=0, M=1, S=1 ve ürün toplamı=2 sonucunu verdi. Arşivli/takipsiz/karışık/aktif varyantsız ürünler, stok/arama/durum filtreleri, beş sıralamada cursor sayfalaması, eski V4 çıktısının birebir korunması, dashboard sayıları, tenant/yetki ve güvenli sayı sınırları geçti. Tüm fixture verileri dış transaction ile geri alındı; gerçek merchant kayıtları değiştirilmedi.

SQL159 down/up ve assertions geçti. **1199 önceki işlevin tanımı, sahibi ve ACL'si birebir korundu**; beş yeni işlev yeniden uygulama sonrası aynı çıktı. Varyant, depo bakiyesi ve stok hareketi durum digest'leri değişmedi. Kanıtlar: `/tmp/catalog-stock-summary-red.log`, `/tmp/catalog-stock-summary-green.log`, `/tmp/catalog-stock-summary-roundtrip.json`.

Yerel ortak storefront ve müşteri paneli production build kontrolleri exit0 ile başarılı; panel TypeScript ve statik sayfa üretimi geçti. Contracts ve data TypeScript kontrolleri başarılı. Yoğun varsayılan data test çalıştırmasındaki mevcut child-process timeout, eşzamanlılık4 ile tam671/671 tekrarında geçti.

## Canlı veritabanı ve yedekler

- Canlı hedef: PostgreSQL 16.14, `celebix_saas_staging_auth01`. SQL159 **up → assertions** başarılı.
- Root tarafından alınan `/tmp/stockfix-real-live-preddl.json` ve `/tmp/stockfix-real-live-afterddl.json` karşılaştırmasında stok kayıtları aynı; tamamlanan satış, rezervasyon ve hareket conservation digest'leri değişmedi. DDL gerçek satış/stok verisini değiştirmedi.
- Canlı geçiş öncesi tam yedek: `/data/celebix-release-backups/product_stock_fix_live_20260926_130549.dump`; SHA256 `25dbfd625d731fd7b75d0d9c63040faaba1f2fa347519910ce11bcef34eb57e0`.
- Prova kopyasının yedeği: `/data/celebix-release-backups/product_stock_fix_20260926_125656.dump`; SHA256 `f719aacfcb401caa16aa644d4cb35dd42f91807f7c1c70b7f686a1d926a694da`.
- SQL159 up SHA256: `fedd7000640b175bc9113e51887687e8f8bd27776a9c79a9c3957d3a2baafa14`.

## Tamamlanan uygulama yayını

| Ortak uygulama | Deployment | Durum |
|---|---|---|
| Güzide / `.site` / özel admin alan adları | `u7ip4xfdq2n67iepk9n71pqj` | Tamamlandı: 13:11:37 UTC |
| Siora / `.net` | `ptfq19t2z0k6lk1ludz92zqr` | Tamamlandı: 13:16:07 UTC |

Her iki çalışan image tag, runtime `SOURCE_COMMIT`, PayTR ve Iyzico aday metadata kaynakları `d56a01df675a79f99b03440baea7553dc20926ab` ile eşleşir. Stok summary/parser/repository/component ve SQL159 dosya hash'leri yayın checkout'u ile aynı; mağaza satış ve eski ödeme bağlantıları compiled çıktıda bulunur. [Çalışan kaynak kanıtı](evidence/catalog-product-stock-fix/live-runtime.json).

- Güzide container `0e2fca6ea40c`, image `sha256:2c4f624c196d0c6498d55dab03053145b1123f3c6d4177f8ccd208ce6f188e39`.
- Siora container `21ca12cd5fb7`, image `sha256:3e5d350a73e0b42fdf670186ed72ea5d354101eec612d80ad57865125a6fa03e`.
- Dört admin alan adı HTTP200, status=ok ve Redis ready; iki mevcut storefront kökü HTTP200. [Sağlık kanıtı](evidence/catalog-product-stock-fix/live-health.json).
- Gerçek Siora owner oturumunda Ürünler listesi açıldı: Lunea Noir Asimetrik Düğmeli Vintage Jean `3 adet`, aynı temsilci SKU `SRA-2024-HAKI` ve fiyat1990TRY. Stoksuz kartı0; seçilen stok filtresi ürün satırı döndürmez. Merchant kaydı veya satış oluşturulmadı. CSV toplamı gerçek React DOM testinde doğrulandı; canlı CSV dışa aktarımı yapılmadı.
- Site ON/net OFF PayTR bayrakları, modlar, hook'lar, kapalı Auto/Preview ve sağlayıcı kimlik bilgileri korundu; Iyzico onayı eklenmedi. Kaynak digest aynı. TEST `sha256:61c8747d4251097a8376c1dae23c2b83bdeb8962f1da4e954d861033761e537d`, LIVE `sha256:145df71a172ce18709d30940990273e5fa5cf241e0b578e7a8a37a451e4df83d`.
- Yayın ayar yedekleri 0600 ile `/data/celebix-release-backups/in-store-coolify-yk1h6d97z7ex0h74ok3zrj5c-20260926_130703.json` ve `in-store-coolify-e4xe74cmii7jucbkyor0o412-20260926_130704.json` dosyalarındadır. Script kaynak/digest/hook/bayraklar yanında mevcut dalı da değişiklik öncesinde doğrular.
- [Canlı stok ve SQL roundtrip kanıtı](evidence/catalog-product-stock-fix/live-database.json).

## Geri dönüş

Uygulama önce mevcut V4 ve eski dashboard okuyucularına döndürülür; ardından SQL159 down yalnız eklenen okuma işlevlerini kaldırır. Mevcut POS satışları, stoklar, hareketler ve eski SQL işlevleri korunur. 159 geri dönüşü için satışları yeniden yürütmek veya yedekten merchant verisi geri yüklemek gerekmez.
