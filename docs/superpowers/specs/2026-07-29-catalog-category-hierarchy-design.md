# Catalog Category Hierarchy Design

**Status:** Kullanıcı tarafından 29 Temmuz 2026 tarihinde yazılı olarak onaylandı.

## Amaç

Shared-SaaS ürün kataloğunda üst kategori ve alt kategori ilişkisini manuel kategori yönetimi, hızlı ve gelişmiş ürün oluşturma ve WooCommerce toplu ürün aktarımı boyunca görünür ve kalıcı hâle getirmek. Mevcut PostgreSQL `saas.catalog_categories.parent_id` otoritesi tek veri kaynağı kalır; tarayıcı, dosya veya kaynak platform mağaza ve tenant yetkisi sağlayamaz.

## Mevcut durum

Migration `056`, mağaza kapsamlı kategori tablosunda `parent_id`, `depth`, aynı mağaza foreign key'i, sekiz seviye sınırı ve döngü engeli sağlar. Kategori CRUD sözleşmesi `parentId` alanını kabul eder ve kategori yönetimi formunda temel bir üst kategori seçimi vardır.

Eksikler şunlardır:

- WooCommerce kategori hücresindeki `Üst > Alt` yolları düz metin kategorilere dönüşür ve ebeveyn ilişkisi kaybolur.
- Migration `059`, toplu aktarım kategorilerini yalnız `{name, slug}` olarak doğrular ve her kategoriyi kök seviyede oluşturur.
- Hızlı ve gelişmiş ürün formları kategorileri düz adlarla gösterir; aynı adlı farklı dallar ayırt edilemez.
- Kategori yöneticisi bir ağaç yerine sıralı kayıt listesi gösterir ve doğrudan “alt kategori ekle” akışı sunmaz.

## Seçilen yaklaşım

Mevcut kategori tablosu değiştirilmez. Toplu aktarım taxonomy sözleşmesine isteğe bağlı `parentSlug` eklenir ve mevcut `parent_id` otoritesine bağlanır. Böylece yeni bir kategori sistemi, ikinci tenant otoritesi veya denormalize browser state'i oluşturulmaz.

Reddedilen seçenekler:

1. Yalnız UI girintisi eklemek, toplu aktarımda kalıcı hiyerarşiyi düzeltmediği için reddedildi.
2. Ayrı bir kategori-ağacı tablosu oluşturmak, mevcut `catalog_categories` otoritesini çoğaltacağı ve çatallayacağı için reddedildi.

## Kanonik kategori yolu

WooCommerce kategori hücresinde virgül ayrı kategori yollarını, `>` ise yol seviyelerini ayırır:

```text
Takı > Yüzük > Altın Yüzük, Kampanyalar > Yeni Gelenler
```

Kurallar:

- Bir yol en fazla sekiz seviyedir.
- Boş seviye, başta veya sonda `>`, kontrol karakteri ve sınırı aşan ad reddedilir.
- Her seviye mevcut kanonik slug üreticisiyle slug'a çevrilir.
- Manifestte her kategori `{ name, slug, parentSlug? }` olarak yalnız bir kez bulunur.
- Manifest kökten yaprağa sıralanır; `parentSlug` kullanan her kayıt kendisinden önce gelen bir kategoriye işaret etmelidir.
- Aynı slug farklı ad veya farklı ebeveynle talep edilirse kaynak geçersiz sayılır; sessiz birleştirme yapılmaz.
- Ürünün `categorySlugs` alanı her kaynak yolunun yaprak kategorisini taşır. Ebeveyn üyeliği kategori ağacından türetilir; ürün ile tüm ataları arasında tekrarlı ilişki yazılmaz.
- Virgülle ayrı verilmiş bağımsız bir kök kategori, ürünün ikinci doğrudan kategori ataması olarak korunur.

## Toplu aktarım veri akışı

1. CSV ayrıştırıcı ham kategori hücresini byte sınırları ve kontrol karakteri kurallarıyla doğrular.
2. Kategori-yolu derleyicisi her yolu kökten yaprağa açar, kanonik taxonomy manifestini ve ürünün yaprak slug listesini üretir.
3. HTTP ve repository sınırları `parentSlug` alanını exact-key doğrulamasıyla kabul eder; brand taxonomy sözleşmesi değişmeden `{name, slug}` kalır.
4. Yeni additive migration, `catalog_migration_begin` fonksiyonunu hiyerarşik kategori manifestini doğrulayacak şekilde değiştirir.
5. PostgreSQL; benzersiz slug, mevcut kayıtla ad/ebeveyn eşitliği, ebeveynin aynı mağazada ve aktif olması, döngü ve sekiz seviye sınırını yazmadan önce doğrular.
6. Kategoriler tek transaction içinde kökten yaprağa oluşturulur. Herhangi bir çakışma tüm begin işlemini rollback eder; kısmi ağaç veya ürün işi bırakılmaz.
7. Mevcut job fingerprint, replay ve `operation_mismatch` davranışı kategori ebeveynleri de fingerprint'e dahil edilerek korunur.

## Geriye dönük uyumluluk

- `parentSlug` içermeyen mevcut kategori manifestleri kök kategori olarak kabul edilmeye devam eder.
- Brand manifesti, product batch sözleşmesi ve mevcut `categorySlugs` alan adı değişmez.
- Önceden tamamlanmış migration job kayıtları veya Güzide ürün/kategori ilişkileri yeniden yazılmaz.
- Aynı `sourceDigest` için mevcut job replay davranışı değişmez; farklı bir hiyerarşi yeni kaynak içeriği ve yeni fingerprint gerektirir.

## Manuel kategori yönetimi

`/products/categories` mevcut CRUD API'sini kullanmaya devam eder.

- Aktif kategoriler `position`, Türkçe ad ve kararlı kimlik sırasıyla gerçek ağaç hâline getirilir.
- Her satır tam yolunu ve seviyesini gösterir.
- “Alt kategori ekle” eylemi formu seçilen kategoriyle `parentId` olarak açar.
- Düzenleme sırasında seçili kategori ve tüm alt dalları üst kategori listesinden çıkarılır.
- Arşivlenmiş kategori ebeveyn olarak seçilemez.
- Backend yine son otoritedir; hazırlanmış bir istekle döngü veya cross-store ebeveyn gönderilirse PostgreSQL reddeder.
- Aktif alt kategorisi veya aktif ürün ilişkisi bulunan kategori mevcut davranışla arşivlenemez.

## Manuel ürün oluşturma ve düzenleme

Hızlı ürün formundaki tekli kategori seçimi ve gelişmiş ürün formundaki çoklu seçim, aynı salt-okunur kategori-yolu modelini kullanır.

- Etiketler `Takı › Yüzük › Altın Yüzük` biçiminde gösterilir.
- Aynı adlı kategoriler tam yollarıyla ayırt edilir.
- Kategori kimlikleri değişmez; yalnız sunum etiketi hiyerarşik olur.
- Hızlı form tek kategori, gelişmiş form en fazla sekiz doğrudan kategori seçimi davranışını korur.
- Browser store ID, parent ID veya tenant ID üretmez; seçenekler session-bound onboarding options yanıtından gelir.

## Hata davranışı

- Bozuk kategori yolu kaynak derleme aşamasında `woocommerce_migration_source_invalid` ile kapanır.
- Bilinmeyen ebeveyn, farklı mağaza ebeveyni, arşivli ebeveyn, döngü, dokuzuncu seviye ve mevcut slug/ebeveyn uyuşmazlığı kalıcı yazmadan önce reddedilir.
- Toplu aktarım çakışması güvenli `import_conflict` sonucuna dönüşür; SQL, slug tahsis ayrıntısı veya tenant kimliği istemciye çıkmaz.
- `commit_unknown` sonrasında otomatik ikinci write yapılmaz; mevcut salt-okunur recovery/replay davranışı korunur.
- Manuel form hataları mevcut güvenli kategori hata mesajlarını kullanır.

## Bileşen sınırları

- Ortamdan bağımsız kategori-ağacı yardımcı modülü: sıralama, tam yol etiketi ve descendant hesaplama.
- WooCommerce migration compiler: ham kategori yolunu kanonik taxonomy ağacına çevirme.
- SaaS data migration validation: category ve brand taxonomy sözleşmelerini ayrı ve exact doğrulama.
- PostgreSQL migration: hiyerarşik begin doğrulaması ve atomik kökten-yaprağa insert.
- Customer-panel bileşenleri: yalnız sunum ve seçili UUID'leri gönderme.

Her birim tenant otoritesini kendi başına üretmez ve diğer birimin iç uygulamasına bağımlı olmaz.

## Test stratejisi

Test-first uygulama şu kanıtları içerecektir:

- `Takı > Yüzük > Altın Yüzük` yolu manifestte doğru `parentSlug` zincirini üretir.
- Birden fazla yol, tekrar eden ata ve Türkçe adlar deterministik kanonikleşir.
- Boş, bozuk, dokuz seviyeli ve aynı slug/different-parent yollar reddedilir.
- Manuel kategori ağacı doğru sıralanır; tam yolları üretir ve bir düğümün tüm descendants listesini bulur.
- Hızlı/gelişmiş formda aynı adlı dallar tam yol ile ayırt edilir.
- PostgreSQL 16 harness; atomik ağaç oluşturma, ürün-yaprak ilişkisi, replay, operation mismatch, eşzamanlı begin, mevcut ağaçla eşleşme, parent mismatch, cycle, depth, cross-store izolasyonu, rollback/reapply, backup/restore ve cleanup senaryolarını çalıştırır.
- Customer-panel, `@celebix/saas-data`, `@celebix/saas-contracts`, Owner regresyonları, typecheck ve build geçer.
- Static-security taraması browser tenant/store authority, doğrudan tablo erişimi, secret ve production değişikliği olmadığını kanıtlar.

## Dağıtım ve veri güvenliği

- Migration additive olur ve mevcut kategori/product kayıtlarını yeniden yazmaz.
- Önce disposable PostgreSQL 16 üzerinde tam migration zinciri, rollback ve reapply doğrulanır.
- Commit ve normal push sonrasında yalnız izole customer-panel staging ve staging PostgreSQL hedeflenebilir.
- Güzide mevcut ürünleri veya ilk mağaza kaydı doğrudan değiştirilmez; yeni hiyerarşi doğrulaması ayrı disposable fixture ve gerekirse kullanıcı tarafından başlatılan yeni import ile yapılır.
- Production deploy, domain değişikliği, production credential mutation, merge ve `apps/admin/**` değişikliği yapılmaz.

## Başarı ölçütü

Özellik tamamlandığında mağaza sahibi hem kategori ekranından ana/alt kategori oluşturup yönetebilir hem de toplu ürün yüklemede `Üst > Alt` yollarını kaybetmeden içe aktarabilir. Hızlı ve gelişmiş ürün ekranları aynı kalıcı ağacı tam yollarıyla sunar; bütün yazmalar mevcut session-bound `TenantContext` ve PostgreSQL otoritesi altında kalır.
