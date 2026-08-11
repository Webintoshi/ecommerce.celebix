# Policy Workspace and Published Footer Design

## Status

Kullanıcı tarafından 11 Ağustos 2026 tarihinde yazılı olarak onaylandı.

## Goal

Sabit yedi mağaza politikasını Celebix yönetim panelinin görsel diliyle daha hızlı ve anlaşılır yönetmek; yalnız yayımlanmış politika bağlantılarını storefront footer'a güvenli ve otomatik biçimde yerleştirmek.

## Existing authority

- Politika anahtarları, adları, sıraları ve route değerleri `FIXED_STOREFRONT_POLICIES` tarafından belirlenir ve değiştirilemez.
- Yönetim yazmaları mevcut `storePolicyApi.save` ve server-side `TenantContext` authority zincirini kullanır.
- Storefront, body içermeyen tam yedi kayıtlı `public_policy_index` projeksiyonundan yalnız `published` durumunu okuyabilir.
- Politika sayfası içeriği yalnız exact route üzerindeki mevcut `public_policy_get` akışından gelir ve sanitize edilir.

## Admin experience

- Büyük iki sütunlu kartlar yerine tek, sıkı ve responsive bir politika çalışma alanı kullanılır.
- Üst özet yayımlanan ve taslak sayılarını gösterir; her satır politika adı, sabit route, durum, son güncelleme ve düzenleme eylemini içerir.
- Düzenleyici, masaüstünde Markdown yazımı ile canlı önizlemeyi yan yana; mobilde alt alta gösteren ortalanmış bir modal olarak açılır.
- Durum seçimi açıkça `Taslak` ve `Yayında` seçenekleriyle yapılır. Boş metin yayımlanamaz.
- Modal Escape, backdrop ve kapatma düğmesiyle kapanır; kapanınca odak açan düğmeye döner. Bütün etkileşim hedefleri en az 48px olur.
- Kaydetme sırasında mevcut optimistic version denetimi ve conflict refresh davranışı korunur.

## Footer behavior

- Storefront footer yalnız body-free public policy index kullanır.
- Yalnız `published: true` olan sabit politikalar, sözleşmedeki sabit sırayla gösterilir.
- Taslak politikalar ve bilinmeyen bağlantılar politika grubuna eklenmez.
- Tasarım konfigürasyonundaki sabit politika linkleri önce ayıklanır; yayımlanmış politikalar tek bir `Politikalar` grubunda birleştirilerek tekrar eden bağlantı engellenir.
- Mevcut politika grubundaki politika dışı linkler korunur. Grup yoksa yayımlanmış en az bir politika bulunduğunda eklenir.
- Policy index okunamazsa taslak ya da uydurma link gösterilmez ve footer geri kalan mağazayı çökertmez.
- Masaüstü ve mobil footer aynı projeksiyonu kullanır.

## Visual system

- Beyaz zemin, ince nötr sınırlar ve sınırlı gölge kullanılır.
- Turuncu yalnız birincil eylem, aktif durum ve focus vurgusudur.
- Durum badge'leri mevcut panel tokenlarıyla uyumlu kalır.
- Editörün header ve action footer alanları sabit; içerik alanı kaydırılabilir olur.
- Reduced-motion altında geçiş süresi yaklaşık `0.01ms` kalır.

## Verification

- Sabit kayıtların create/delete/archive authority kazanmadığı doğrulanır.
- Yayımlanan/taslak sayıları, modal yapısı, Markdown önizleme ve erişilebilir durum kontrolleri doğrulanır.
- Footer helper için published-only, fixed-order, deduplication, draft hiding, existing group preservation ve unavailable fallback test edilir.
- Customer-panel ve storefront workspace test, typecheck ve build komutları çalıştırılır.
- `git diff --check` ve değişen dosya taraması yapılır.
