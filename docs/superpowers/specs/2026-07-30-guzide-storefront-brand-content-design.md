# Güzide Storefront Brand Content Design

## Status

Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Güzide Kuyumcu'nun mevcut WordPress vitrininin logosunu, ana bannerını ve Bileklikler, Kolyeler, Yüzükler, Küpeler kategori kartlarını mağaza-bazlı Celebix R2 varlıkları olarak yönetmek; starter temada gerçek kategori bağlantılarıyla göstermek.

## Kaynak varlıklar

- Logo: `logo-99853441-1-scaled-1.webp` (1440×668)
- Hero: `unnamed-file.jpeg` (1440×600)
- Bileklikler: `WhatsApp-Image-2026-05-15-at-15.58.43-1.jpeg` (675×900)
- Kolyeler: `WhatsApp-Image-2026-05-15-at-15.58.43-2.jpeg` (675×900)
- Yüzükler: `WhatsApp-Image-2026-05-15-at-15.58.43.jpeg` (675×900)
- Küpeler: `WhatsApp-Image-2026-05-15-at-16.12.39.jpeg` (675×900)

Varlıklar kaynak mağazanın herkese açık WordPress sayfasından alınmıştır. Güzide staging mağazasına admin akışı üzerinden yüklenecek, kaynak WordPress URL'leri public Celebix projection'ına taşınmayacaktır.

## Otorite ve veri modeli

- `StorefrontAssetKind` listesine `category` eklenir. R2 anahtarı mevcut mağaza izolasyonunu korur: `stores/<storeId>/storefront/category/<assetId>.<ext>`.
- `category_showcase` tekil merchant-admin kaydı eklenir. Yapı yalnız `heading`, `enabled` ve 1–8 adet `{categoryId, assetId}` içerir.
- PostgreSQL save sınırı her kategori ve varlığı aynı mağaza altında, aktif durumda ve doğru `category` türünde doğrular. Tekrarlanan kategori/varlık ve çapraz mağaza kimliği reddedilir.
- Public projection kategori adı ve slug'ını kalıcı katalog otoritesinden üretir. Tarayıcıdan store/category otoritesi alınmaz.
- Starter presentation'a opsiyonel `logo` ve `categoryShowcase` eklenir. Eski mağazalar metin logosu ve kategorisiz ana sayfayla geriye uyumlu kalır.
- Kategori hedefi `/categories/<canonical-slug>` olur. Public repository yalnız aktif kategorinin bağlı aktif ürünlerini döndürür.

## Admin deneyimi

- Tasarım ayarlarında logo ve kategori görselleri yüklenebilir.
- Logo varlığında “Logo olarak kullan” işlemi genel görünüm kaydına bağlanır.
- Ayrı kategori vitrini editörü katalog kategorilerini ve aktif `category` varlıklarını yükler; sıralı kartları kaydeder.
- Taslak kayıt public vitrinde görünmez. Yetkisiz kullanıcı yalnız okuyabilir.

## Starter tema

- Header logo varsa gerçek oranıyla görüntüler, aksi halde mağaza adını gösterir.
- Ana hero kabul edilmiş 1440×600 görseli mevcut tam genişlik davranışıyla kullanır.
- Hero ile ürünler arasına dört kartlık, mobilde iki sütuna/tek sütuna güvenli kırılan kategori vitrini eklenir.
- Kartlar `<Link>` ile gerçek kategori sayfasına gider; görsel alt metni kategori adıdır.
- Kategori sayfası seçili kategori başlığını ve yalnız ilişkili aktif ürünleri gösterir.

## Güvenlik ve başarısızlık davranışı

- Harici görsel URL, query/fragment içeren hedef, yanlış mağaza varlığı veya arşivli kategori fail-closed olur.
- Public projection secret, object-key, store authority veya admin config kimliklerini sızdırmaz.
- RLS ve direct-DML yasakları korunur. Migration `067` append-only olacaktır; `066` değiştirilmez.
- Production deploy/domain değişikliği yapılmaz.

## Kabul

- Unit, repository, static-security ve PostgreSQL 16 migration/rollback/reapply testleri geçer.
- Customer-panel ve storefront typecheck/build geçer.
- Desktop ve mobile browser görüntülerinde logo, hero ve dört kategori kartı kaynak düzene sadık görünür.
- Kategori kartı yalnız doğru kategori ürünlerini açar; yakın/yanlış slug bulunamadı olur.
- Güzide staging mağazasında altı varlık admin paneli üzerinden yüklenip bağlanır.
