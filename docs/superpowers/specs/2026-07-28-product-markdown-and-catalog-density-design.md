# Product Markdown and Catalog Density Design

**Date:** 2026-07-28

**Status:** Kullanıcı tarafından 28 Temmuz 2026 tarihinde yazılı olarak onaylandı.

**Implementation branch:** `codex/ikas-quality-product-onboarding-implementation`

**Implementation base:** `98946e504bc8002c9d29e959e7c76155b785117e`

**Visual evidence:** Kullanıcının 28 Temmuz 2026 tarihinde paylaştığı yeni ürün başlığı, ürün özet/arama satırı ve toplu işlem satırı ekran görüntüleri.

## 1. Outcome

Ürün açıklamaları kaynağı değiştirilmeden Markdown olarak yazılabilmeli, customer-panel içinde güvenli biçimde önizlenebilmeli ve storefront ürün sayfasında aynı ortak kurallarla gösterilebilmelidir. Mevcut düz metin ve güvenli legacy HTML açıklamalar geriye uyumlu kalmalıdır.

Aynı teslimat ürün oluşturma ve ürün listesi ekranlarındaki gereksiz görsel ağırlığı kaldırmalıdır. Büyük dekoratif oluşturma başlığı kompaktlaşmalı; tekrar eden sayaçlar dört eşit özet metriğine indirgenmeli; arama, filtre, yenileme ve toplu işlem kontrolleri masaüstü ve mobilde eşit yükseklik, açık grup sahipliği ve sıfır yatay taşma ile çalışmalıdır.

Bu iş veri modelini, ürün yetkisini veya kalıcı mutation sözleşmesini değiştirmez.

## 2. Authority and persistence boundaries

- Açıklamanın kanonik kaynağı mevcut `Product.description` string alanıdır.
- PostgreSQL aynı en fazla 10.000 karakterlik kaynak metni saklar; Markdown kaydedilirken HTML'e çevrilmez.
- Yeni tablo, kolon, migration, runtime flag veya browser-supplied tenant/store authority eklenmez.
- Mevcut ürün oluşturma ve güncelleme contract/repository sınırları değişmez.
- Customer-panel ve storefront aynı `@celebix/platform-config` normalizer'ını kullanır; iki ayrı Markdown uygulaması oluşturulmaz.
- SEO, hızlı görünüm ve feed tüketicileri ortak plain-text extractor üzerinden biçimlendirme işaretlerinden arındırılmış metin alır.
- `apps/admin/**` değişmez ve donor olarak salt okunur kalır.

## 3. Markdown contract

### 3.1 Input and storage

Ürün oluşturma ve düzenleme textarea alanları Markdown kaynağını aynen gönderir. Baştaki/sondaki mevcut form normalizasyonu dışında satır sırası, link hedefi, kod, liste ve vurgu işaretleri yeniden yazılmaz.

Editör aşağıdaki desteği açıkça bildirir:

- paragraflar ve satır sonları;
- `#`–`####` başlıkları;
- sıralı ve sırasız listeler;
- kalın, italik ve üstü çizili metin;
- blockquote;
- inline code ve fenced code block;
- tablo;
- güvenli bağlantı.

Markdown görselleri desteklenmez. Ürün görselleri mevcut R2-backed medya yöneticisinin otoritesinde kalır.

### 3.2 Parser and sanitizer

`@celebix/platform-config` paketine doğrudan ve sürümü kilit dosyasında izlenen `markdown-it` bağımlılığı eklenir. Parser şu kapalı ayarlarla çalışır:

- raw HTML kapalı;
- otomatik link algılama kapalı;
- typographer kapalı;
- sınırlı nesting;
- Markdown image renderer kapalı.

Parser çıktısı mevcut allowlist sanitizer'dan geçirilmeden hiçbir tüketiciye verilmez. Allowlist yalnız semantik metin elemanlarını içerir: paragraph, break, strong/emphasis/underline/delete, heading 2–4, list, blockquote, code/pre, horizontal rule, table structure ve anchor.

Anchor hedefleri yalnız relative path, fragment, `mailto:`, `tel:`, `http:` veya `https:` olabilir. Dış bağlantılar `target="_blank"` ve `rel="noopener noreferrer nofollow"` alır. Event handler, style, class, id, script, iframe, form, SVG, media, image ve bilinmeyen attribute/tag çıktıları kaldırılır.

Mevcut HTML açıklamalar önceki sanitizer davranışıyla desteklenir. HTML içermeyen mevcut düz metin, Markdown parser'da tek veya çoklu paragraph olarak aynı okunabilir sonucu verir.

### 3.3 Panel preview

Yeniden kullanılabilir bir `ProductDescriptionField` bileşeni:

- textarea'nın gerçek form alanı sahipliğini korur;
- kaynak değeri kontrollü olarak izler;
- `Markdown desteklenir` yardım metni gösterir;
- boş kaynakta kontrollü boş önizleme gösterir;
- dolu kaynakta ortak normalizer çıktısını `Markdown önizleme` bölgesinde gösterir;
- raw kaynak veya sanitizer dışı HTML render etmez;
- create ve edit akışında aynı bileşen olarak kullanılır.

Ürün ayrıntısındaki salt okunur açıklama kartı da aynı ortak güvenli render sonucunu kullanır. Böylece merchant'ın gördüğü önizleme storefront sonucuyla aynı semantiğe sahiptir.

## 4. Catalog layout repair

### 4.1 Product create heading

`/products/new` içindeki büyük gradient/glow hero kaldırılır. Yerine:

- içerik genişliğiyle hizalı;
- düz beyaz/şeffaf surface üzerinde;
- en fazla 32px masaüstü ve 28px mobil başlık;
- kısa açıklama;
- gereksiz büyük boşluk ve dekoratif blur içermeyen

kompakt sayfa başlığı kullanılır. Geri bağlantısı ve erişilebilir `h1` sahipliği korunur.

### 4.2 Product summary row

Tekrarlanan `görüntüleniyor`, `yüklendi` ve `mağazada` chip dizisi yerine dört semantik metric gösterilir:

1. Toplam
2. Aktif
3. Taslak
4. Stoksuz

Metric'ler `dl/dt/dd` semantiğiyle aynı yükseklik ve eşit kolon genişliğine sahiptir. Loading/unavailable durumları sayı uydurmaz; `—` ve güvenli erişilebilir durum metni kullanır. Görüntülenen/yüklenen aralık yalnız liste durum satırında bir kez gösterilir.

Masaüstünde özet grid, arama, filtre ve yenileme tek satırda açık kolonlara ayrılır. Orta genişlikte özet grid kendi satırını alır. Mobilde metrikler 2x2, arama tam genişlik, filtre/yenileme takip eden kontrollü alanda yer alır. Hiçbir metin kesilmez ve yatay overflow oluşmaz.

### 4.3 Bulk action row

Toplu işlem satırı iki gruba ayrılır:

- sol: tümünü seç, toplu işlem seçimi, uygula, seçili adet;
- sağ: görünür/yüklü/toplam aralığı ve satır sayısı.

Tüm interactive kontroller 48px yüksekliğinde kalır. İçeriğe göre genişlik değişebilir ancak border, radius, baseline ve dikey hizalama aynıdır. Dar ekranda gruplar belirlenmiş satırlara geçer; satır sayısı ikincil bilgi olarak gizlenebilir fakat mutation kontrolleri ve seçili adet görünür kalır.

## 5. Component and file ownership

Planned production ownership:

- `packages/platform-config/src/product-description-rich-text.ts`: Markdown parse + ortak sanitize/plain-text contract.
- `packages/platform-config/package.json` ve root `package-lock.json`: yalnız doğrudan Markdown dependency kaydı.
- `apps/customer-panel/components/catalog/ProductDescriptionField.tsx`: editör ve güvenli önizleme.
- `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`: edit/read-only Markdown kullanımı.
- `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`: create Markdown alanı.
- `apps/customer-panel/components/catalog/ProductCreateForm.tsx`: kompakt başlık.
- `apps/customer-panel/components/catalog/ProductListConsole.tsx`: dört metric ve iki gruplu bulk row.
- `apps/customer-panel/app/globals.css` ve mevcut onboarding CSS: ortak görünüm ve responsive kurallar.
- Storefront component veya wrapper dosyası değiştirilmez; mevcut `ProductFeatures` ortak normalizer'ı zaten doğrudan kullanmaktadır ve yeni Markdown davranışını bu sınırdan alacaktır.

Yeni parser testleri `packages/platform-config/src/product-description-rich-text.test.ts` içinde, panel contract testleri mevcut customer-panel product-console/onboarding test yüzeylerinde yaşar. No migration, SQL, Owner, infrastructure or `apps/admin/**` change is expected.

## 6. Error and security behavior

- Boş açıklama boş preview üretir; sahte içerik göstermez.
- Parser/sanitizer hiçbir network çağrısı yapmaz.
- Invalid veya tehlikeli link tıklanabilir hedef üretmez.
- Raw HTML içindeki script/style/event handler çalışmaz.
- Markdown içindeki HTML literal olarak çalıştırılmaz.
- Kod bloklarının içeriği HTML olarak yorumlanmaz.
- Açıklama uzunluğu mevcut 10.000 karakter sınırında kalır.
- Summary authority unavailable olduğunda gerçek sayı yerine `—` gösterilir.
- Layout değişikliği filtre, arama, bulk mutation, archive confirmation, pagination veya refresh davranışını değiştirmez.

## 7. TDD and acceptance

Implementation begins with failing tests that prove:

- headings, emphasis, lists, tables, code and safe links render;
- Markdown source remains unchanged through product form payloads;
- raw HTML/script/event attributes and unsafe URL protocols cannot execute;
- existing plain text and sanitized legacy HTML remain compatible;
- plain-text extraction removes Markdown presentation while preserving readable content;
- create and edit surfaces expose the same Markdown field/preview contract;
- product read-only summary does not show raw Markdown punctuation;
- exactly four fixed product metrics are rendered with honest loading/unavailable states;
- duplicated count chips are absent;
- bulk controls retain all existing actions and accessibility labels;
- CSS establishes equal metric columns, 48px interactive height, mobile 2x2 metrics and zero overflow-prone nowrap container.

Required verification:

- focused platform-config Markdown tests;
- focused customer-panel product console/onboarding tests;
- `@celebix/platform-config` typecheck;
- customer-panel test, typecheck and build;
- storefront-base typecheck and build;
- existing catalog/Phase 3 regression suite;
- `git diff --check`;
- `apps/admin/**` diff count `0`;
- forbidden `javascript:`, raw-script and secret scan in the tracked diff;
- local browser verification at 1440x900, 1024x768, 640x844 and 390x844;
- measured horizontal overflow `0` and interactive target height at least 48px.

No staging or production deployment is included without a separate explicit instruction.

## 8. Definition of done

The delivery is complete only when a merchant can enter Markdown once, see a safe panel preview, save the exact source, reopen it unchanged, and observe equivalent formatted content on the storefront; legacy descriptions still render; all XSS/link negative tests pass; the create heading is compact; list metrics are four equal honest cells; toolbar and bulk controls align and reflow without overflow; regressions pass; `apps/admin/**` remains unchanged; and no deployment or production impact occurs.
