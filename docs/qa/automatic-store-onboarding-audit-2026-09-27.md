# Otomatik işletme kaydı ve mağaza açılışı incelemesi

Tarih: 27 Eylül 2026. Kapsam: hesap/kimlik doğrulama, mağaza sahibi yetkisi, ortak admin ve storefront başlangıcı, hata sonrası toparlanma. Kullanıcının talebi inceleme ve özettir; uygulama, dağıtım veya yeni işletme kaydı yapılmadı.

## Güncel akış

Mağaza adı/adresi ve onaylar → Logto kimlik doğrulama → doğrulanmış kimlik → tek PostgreSQL işlemiyle işletme, sahip üyeliği, ücretsiz paket, alan adı, medya alanı ve temel ayarlar → panel oturumu.

Yeni işletmeler ortak SaaS admin ve storefront uygulamalarını kullanır. Her kayıt için ayrı uygulama dağıtımı, Supabase projesi veya R2 bucket oluşturulmaması bu mimaride eksik değildir. Eski `store-provisioning.ts` ve ayrı mağaza scaffold akışı farklı bir yoldur; eski provisioning dokümanları yeni kayıt akışının güncel kanıtı sayılmadı.

## Kaynak ve canlı karşılaştırması

- İncelenen çalışma ağacı: `9b644a168f8c9d6aef8c8f37f1e6fcac16b32e5e`; ortak panel/storefront üretim kaynağı `89cc73218f2a7113f2fd593ca743e45e51621a98`.
- NET owner çalışan kaynağı `3613b565c249fa7080ead567a14629a36ea6c56a`. Runtime, resolver, config, kayıt sayfası ve tenant core dosyaları incelenen ağaçla hash olarak eşleşir.
- SITE owner çalışan image kaynağı `65f0500ae544d4bccb4fbc3006b4b9e307d1e66e`; Coolify pin'i `17e6c10f543917c3c4c85b6d662bce299a8da2ae`. İlgili eski runtime/core/page dosyaları bu iki commit arasında aynıdır; NET'ten farklılıklar dikkate alındı. Bu, tek başına provisioning arızası kanıtı değildir.
- İki owner ortamı da `approved_staging` / `staging` modunda. Eski `SELF_SERVE_*` create/provision bayrakları modern mount'un otoritesi değildir; unset olmaları otomasyonun kapalı olduğu şeklinde yorumlanmadı. Ana üretim modu kod tarafından bu staging aktivasyonundan ayrılır.
- İki staging `/kayit` sayfası HTTP200, gerçek submit `disabled` niteliği yok ve `aria-disabled=false`. Aynı sayfada henüz mağaza oluşturulmadığını söyleyen hazırlık mesajı gösteriliyor.
- Logto provider, completion service ve kalıcı registration store kaynakları iki çalışan owner'da incelenen kaynakla eşleşti. SITE callback dosyası daha eski; güncel callback satırlarının tüm SITE ayrıntılarını temsil ettiği iddia edilmedi.

## Bulgular ve öncelik

| Öncelik | Bulgu | Kanıt ve etkisi |
|---|---|---|
| P1 | Yeni mağazanın storefront başlangıcı tüm alan adı ortamlarında ortak değil. | Core `saas.domains` kaydı açıyor (`packages/saas-tenant-core/src/create-starter-tenant.ts:344`). Modern public çözümleme `saas.store_domains` kullanıyor. Migration148'in otomatik eşleştirme/tasarım tetikleyicisi yalnız `<slug>.saas-staging.celebix.net` için çalışıyor (`202609230148_celebix_net_staging_starter_storefront.up.sql:25`). Genel/SITE yeni kayıtta modern public eşleştirme ve yeni tasarım satırı garanti edilmez. |
| P1 | Yarıda kalan veya sonucu belirsiz kurulum için otomatik toparlanma bağlı değil. | `self-serve-registration-completion.ts:228` bekleyen/belirsiz durumu döndürüyor; `:275` recovery metodu var ancak gerçek çağrı yolu/worker yok. `postgres-registration-attempt-store.ts:547` eski `creating` durumunu da devam ediyor kabul ediyor. Kütüphane recovery testleri bağlı akışın otomatik toparlandığını kanıtlamaz. |
| P2 | Geçici bağlantı hatası sonrasında kayıt süreci kendiliğinden iyileşmeyebilir. | `self-serve-auth-route-runtime/resolver.ts:33` başarısız initialization sonucunu süreç boyunca saklıyor. `self-serve-logto-provider/provider.ts:206,228` ilk discovery/JWKS hatasını ve başarılı anahtar setini süresiz tutuyor. Sentetik testte servis iyileşse de tekrar fetch/initialize yapılmadı; yeni Logto imza anahtarı yüklenmedi. Gerçek kesinti veya anahtar değişimi gözlenmedi. |
| P2 | Başlangıç tasarımı ilk yayın için kendi kurallarıyla uyuşmuyor. | Migration148 `hero.enabled=true` ve görsel=null ile aynı dokümanı draft/published olarak yerleştiriyor (`:61,85`). Güncel migration165 yayın kontrolü etkin banner için görsel istiyor (`:185`). Canlı SQL'de sentetik başlangıç dokümanı yapı olarak geçerli, yayınlanabilirlik false. Renk/logo düzenleyen yeni işletme bile banner görseli eklemek veya banner'ı kapatmak zorunda kalıyor. |
| P2 | İşletmeyi ilk satışa hazırlayan gerçek başlangıç kontrol listesi eksik. | Core yalnız locale/currency/theme ayarı açıyor ve `provisioningStatus=ready` döndürüyor (`create-starter-tenant.ts:425,471`). `/setup` üç sabit tamamlanmış durum gösteriyor (`apps/customer-panel/app/(panel)/setup/page.tsx:1`). Checkout kargo ve aktif ödeme yöntemi ister; kurulum bunları açmıyor. Bu ayarların işletmeden alınması normaldir, fakat eksiklikleri ve yapılacak işleri ilk girişte göstermek gerekir. |
| P2 | Kayıt ekranı durum ve adres metinleri gerçek akışla uyumsuz. | Aktif kayıt formuna rağmen hazırlık mesajı koşulsuz gösterilir (`apps/owner/app/kayit/page.tsx:30`). SITE eski sayfa formda varsayılan `.celebix.site` gösterir, runtime `.saas-staging.celebix.site` üretir. Ana `https://ecommerce.celebix.co/kayit` adresi üç salt okunur istekte HTTP503 döndü; nedenine dair altyapı değişikliği veya varsayım yapılmadı. |

## Canlı salt okunur kanıtlar

`celebix_saas_staging_auth01` üzerinde owner rolüyle `REPEATABLE READ / READ ONLY` işlemler yürütüldü ve `ROLLBACK` ile kapatıldı. Yalnız toplu sayılar ve boolean sonuçları dışarı çıktı; isim, e-posta, mağaza kimliği, token, şifre veya müşteri dokümanı kaydedilmedi.

- NET: 1 aktif canonical platform alan adı, modern storefront eşleştirmesi eksik 0, mevcut tasarımı eksik 0.
- SITE: 9 aktif canonical platform alan adı, modern storefront eşleştirmesi eksik 8, mevcut tasarımı eksik 0. Bunların test veya müşteri işletmesi olduğu sınıflandırılmadı. Mevcut tasarımların bulunması, gelecekteki kayıt için genel tasarım seed'i olduğunu kanıtlamaz; eski migration backfill'i ayrı tutuldu.
- Canlı otomatik starter storefront fonksiyonları yalnız `provision_celebix_net_starter_storefront` ve tetikleyici fonksiyonudur; tanımdaki NET sınırlaması doğrulandı.
- Migration148 başlangıç dokümanı yalnız bellek/SQL ifadesi olarak yeniden oluşturuldu: `draftStructurallyValid=true`, `publishableByCurrentRules=false`. Hiçbir mağaza veya tasarım satırı eklenmedi/değiştirilmedi.
- Workflow toplu durumları: `tenant_created=10`, `awaiting_identity=75`, `identity_verified=8`. Bekleyen kimlik doğrulamalarının tümü kurulum arızası sayılmadı.
- Tenant completion durumları `completed=10`, `ready=8`; 10 dakikadan eski `creating` completion sayısı 0. Otomatik recovery eksikliği doğrulanmış bir kod açığıdır; bu sorgu anında takılı `creating` işlemi veya canlı belirsiz commit vakası gözlenmedi.

## Olumlu taraflar ve doğrulama sınırı

Doğrulanmış kimlik, immutable issuer+subject, aktif `store_owner` üyeliği, ücretsiz paket ve tenant medya ayrımı mevcut. Mağaza kayıtları tek transaction içinde; normal başarısızlık rollback, aynı attempt tekrarları ve çakışmalar için idempotency/unique korumaları var. Otomatik Ana Depo ve boş draft politika kayıtları bulunuyor; boş katalog ilk ürün ekleme eylemi sunuyor.

Odaklı mevcut testler başarılı: hesap/auth/completion grupları 152, tenant-core grubu 38, resolver grubu 8, atomic/replay/recovery alt grubu 10 ve migration165 grubu 6. Gruplar örtüşebilir; benzersiz toplam olarak sunulmadı. Ayrıca geçici initializer/discovery hatası ve Logto anahtar yenilenmesi için yerel sahte bağımlılıklarla küçük yeniden üretimler yapıldı. Bu kontroller gerçek yeni işletmeyle uçtan uca kayıt/ilk satış testi değildir.

Önerilen sıra: ortamdan bağımsız tek başlangıç paketi ve atomik modern storefront/tasarım kayıtları; kalıcı retry/reconciliation yolu; geçerli boş başlangıç tasarımı ve gerçek kurulum kontrol listesi; geçici bağlantı/JWKS yenilenmesi; ardından izole yeni işletme senaryosuyla hesap → panel → görsel yükleme → ilk ürün → tasarım yayını → ödeme/kargo ayarı doğrulaması.
