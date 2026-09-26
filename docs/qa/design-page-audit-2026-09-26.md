# Tasarım sayfası incelemesi — 26 Eylül 2026

## Özet

İncelenen sayfa: [Butik Siora / Ayarlar / Tasarım](https://butik-siora.admin.saas-staging.celebix.net/settings/design).

Bu çalışma araştırma ve hata tespitidir. Mevcut taslak, yayın, ürün ve vitrin kayıtlarında değişiklik yapılmadı. Ortak müşteri paneli, tasarım sözleşmeleri, kayıt/yayın yolu ve ortak mağaza uygulaması birlikte incelendi. Canlı arayüz, yayımlanan mağaza ve dar kapsamlı salt okunur veritabanı sorguları karşılaştırıldı.

Uygulama kaynağı: `d02c41604cd26cec4d8cd93cbdabe76029c8822c`. İncelenen çalışma ağacının HEAD'i `0adfd8b209a5ff0432ba86d479e2dcc4804b3e97`; bu son commit yalnız önceki Toshi sürümünün belgelerini ekliyor.

**Başlıca sonuç:** Ürünlerin tek tek seçilememesi gerçek bir özellik eksiği. Buna ek olarak kategori vitrininin yayın kaynağı, duyurunun iki ayrı kaydı, geri alma ve banner yayın doğrulaması gibi bağımsız hatalar var. Önizleme, özellikle ürün detayında, değiştirilen ayarların gerçek sonucunu yeterince göstermiyor.

## 1. Sayfanın amacı ve kapsamı

Tasarım sayfası, her mağazanın ortak vitrin görünümünü düzenleyen bir çalışma alanıdır. Ortak panel kodu kullanılır; içerik ve tasarım mağaza bazında saklanır.

| Alan | Mevcut işlev |
|---|---|
| Logo ve marka | Logo, tarayıcı simgesi, mağaza görsel arşivi |
| Renk ve yazı | Ana/vurgu/arka plan/metin renkleri; başlık ve gövde yazıları; kart, oran, köşe ve aralık seçenekleri |
| Duyuru | Görünürlük, mesajlar, bağlantı; gelişmiş simge, hız, yön ve hareket seçenekleri |
| Header ve menü | Yerleşim, zemin, genişlik, menü kategorileri ve öne çıkan kategori |
| Ana sayfa | Bannerlar ve sıralanabilir içerik bölümleri |
| Ürün sayfası | Galeri, SKU, marka, gezinme yolu, adet, benzer ürünler, yorum, beden rehberi, bilgi blokları, mobil satın alma |
| Yan sepet | Adet seçimi, ödeme hazırlığı ve güven mesajı |
| Footer | Link grupları, renk tonu, bülten ve sosyal profiller |

**Ürün sayfası ayarları bütün ürünlerin ortak şablonunu değiştirir.** Burada tek bir ürüne özgü farklı sayfa tasarımı atanmaz. Ürünün kendi fotoğrafları, açıklaması, fiyatı ve varyantları katalogdan gelir. Veri bulunmayan bazı bilgi blokları canlı ürün sayfasında gösterilmez.

Ana sayfa düzenleyicisinde sabit üst bannerın altında altı bölüm türü bulunuyor:

| Bölüm | Mevcut kontrol | Eksik veya sınır |
|---|---|---|
| Kategori vitrini | Başlık, iki büyük kart/ızgara, kategori seçimi | Kart görselini kategoriye bağlayan aktif kontrol yok |
| Ürün bölümü | Yeni/indirimli/bir kategori; 4/8/12 ürün | Tekil ürün seçimi ve bölüme özel sıralama yok |
| İkili kampanya | İki kartın başlığı, görseli ve bağlantısı | Bazı değişiklikler mevcut açıklamaları kaybettirebiliyor |
| Marka hikâyesi | Küçük başlık, başlık, açıklama, görsel, bağlantı | İçerik tabanlı bölüm |
| Değer önerileri | Mevcut öğelerin simgesi, başlığı, açıklaması | Öğeleri ekleme/silme kontrolü yok |
| Yorumlar | Başlık, 3/6/9 adet, minimum 4/5 yıldız | Gerçek yorumlarla taslak önizleme yok |

Mevcut sınırlar: en fazla üç banner slaytı, dört ürün bölümü ve toplam on iki ana sayfa bölümü. Ürün dışındaki bölüm türleri tekilleştirilmiş.

## 2. Nasıl çalışıyor?

1. Alan seçilince bir ayar paneli açılır. Alanlar aynı mağaza taslağını düzenler.
2. Son değişiklikten yaklaşık **700 ms** sonra taslak otomatik kaydedilir.
3. Kayıt sürüm kontrolüyle `draft_config` alanına gider. **Bitti**, ayar panelini kapatır.
4. Önizleme taslağı ve mağazanın katalog/görsel kaynaklarını kullanır.
5. **Yayınla**, bekleyen kayıtları bekler; son değişikliği kaydeder; ayrı bir yayın işlemi yapar.
6. Veritabanı iki sürümü satır kilidi altında kontrol eder ve taslağı atomik olarak `published_config` alanına kopyalar.
7. Mağaza yayımlanmış kaydı okur. Yayın sonrasında ayar önbelleği yenilenir.

Kayıt/yayın ayrımı, mağaza ve yetki denetimi, sürüm çakışması koruması, yerel değişiklikleri koruma ve tekrar deneme yolları mevcut. Bunların tümü eksikmiş gibi bir yeniden yazım gerekmez.

**Canlı Siora gözlemi:** Taslak sürümü `10`, yayın sürümü `3`; iki belge farklı. Taslakta banner alanı açık, açık slayt sayısı sıfır. Yayındaki belgede bir açık slayt var. Bu yüzden panelde banner görünmezken mağaza ana sayfasında banner görünüyor. Bu fark kayıt/yayın ayrımıyla uyumludur. İki sürüm sayacı farklı işlemleri sayar; aralarındaki fark, yayınlanmamış değişiklik sayısı değildir.

## 3. Öncelikli bulgular

P1: yayın doğruluğu veya düzenleme kaybı açısından önce ele alınmalı. P2: işlev, önizleme veya kullanılabilirlik sorunu. Özellik eksikleri ayrıca işaretlenmiştir.

### D01 — Tek tek ürün seçimi yok — P2, özellik eksiği

**Kanıt:** Canlı “Hangi ürünler?” alanında yalnız Yeni ürünler, İndirimli ürünler ve Bir kategori seçenekleri var. UI, sözleşme, önizleme ve sorgu modeli `productIds` veya bölüme özel sıra taşımıyor. Bellek içi kontrolde `productIds` eklemek `storefront_contract_invalid` ile reddedildi.

**Sonuç:** Bir kategori seçildiğinde mağazanın o kategoriye ait ortak katalog sırasından ilk N ürün gelir. Tasarım sayfasında kategori içinden örneğin yalnız üç özel ürün seçilemez. Başka bir yerde kategori ürün sırası değiştirilse bile bu, belirli vitrin bölümünün bağımsız seçimi değildir.

**Öneri:** “Otomatik getir” ve “Ürünleri ben seçeyim” yolları. Elle seçimde kategori filtresi, ad/SKU/barkod araması, görselli sonuç, seçilenler listesi ve yukarı/aşağı veya sürükleyerek sıralama. İlk sürümde mevcut 12 ürün sınırı korunabilir. Seçimler bölüm bazında sıralı ürün kimlikleriyle saklanmalı ve sunucuda mağaza sahipliği doğrulanmalı.

Kanıt: [aktif ürün alanı](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:83), [sözleşme](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/packages/saas-contracts/src/storefront/types.ts:54).

### D02 — Kategori vitrininin önizleme ve yayın kaynağı farklı — P1

**Neden:** Taslak önizleme bölümün `heading/layout/categoryIds` değerlerini kullanıyor. Canlı ana sayfa ise kategori bölümünü ayrı `presentation.categoryShowcase` kaydıyla değiştiriyor. Bu ayrı alan en son aktif `merchant_admin_records.category_showcase` kaydından geliyor. Tasarımın kayıt/yayın yolunda bu kayda senkronizasyon bulunmuyor.

**Sonuç:** Tasarımda seçilen başlık, kategori listesi veya düzen yayında başka vitrin kaydıyla ezilebilir. Ayrı vitrin yoksa bölüm kaldırılır. Bellek içi denemede “Yeni taslak başlığı / duo”, canlı birleştirme yolunda “Eski ayrı kayıt başlığı / grid” oldu.

**Kapsam:** Kod, mevcut SQL yazma yolu ve model deneyiyle doğrulandı. Siora taslağına kategori bölümü eklenip yayımlanmadı; bu incelemede mağaza içeriği değiştirilmedi.

**Öneri:** Başlık, seçilen kategoriler, düzen ve sıra için tek tasarım kaydı kullanmak. Kategori görselleri ayrı bir varlık eşlemesi olarak kalabilir; içerik seçimini ikinci bir vitrin belgesi belirlememeli.

Kanıt: [canlı bölüm birleştirme](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/storefront-shared/components/campaign-home-sections.ts:35), [taslak projeksiyonu](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/lib/storefront-design-preview-model.ts:198), [yayın işlemi](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202608030082_storefront_hero_slider.up.sql:235).

### D03 — Kategori seçiminde önizleme yenilenmeyebilir — P2

Kategori kaynak bağımlılık anahtarı kategori kimliklerini içermiyor; yalnız kategori vitrini var/yok bilgisi var. Loader yalnız seçili kategorileri yüklediği için A kategorisinden daha önce yüklenmemiş B'ye geçişte istek atlanabilir. B eksik/boş görünebilir. Bellek içi A/B denemesinde bağımlılık anahtarları eşit çıktı.

Kanıt: [bağımlılık anahtarı](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/lib/storefront-design-preview-model.ts:63), [istek atlama](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/lib/storefront-design-preview-ui/use-preview-resources.ts:39).

### D04 — Kategori görseli bağlama yolu eksik ve hata açıklaması yetersiz — P2

Aktif kategori vitrini yalnız başlık, düzen ve kategorileri düzenliyor. Görseli kategoriye bağlayan eski `CategoryShowcaseEditor` aktif sayfada kullanılmıyor. Görsel arşivi yükleme sağlıyor; hangi kategori kartının hangi görseli kullanacağını atamıyor.

SQL, seçilen kategori için aktif vitrin/görsel eşlemesi istiyor; gizlenmiş kategori bölümleri de bu kontrolden çıkarılmıyor. Bu durumda kullanıcıya bölüm/görsel ayrıntısı yerine genel “Bilgileri kontrol edin” hatası gelebilir.

Öneri: kategori seçiminin yanında kart görseli seçmek; eksikleri ilgili kart üzerinde göstermek; gizli bölümün yayını gereksiz yere engellemesini önlemek.

Kanıt: [kategori alanları](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:75), [sunucu referans kontrolü](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202608040083_storefront_unified_theme_authority.up.sql:106).

### D05 — Önizleme önemli ayarları uygulamıyor — P2

Canlı panelde ürün önizlemesi sabit “Örnek ürün adı” kartı. Gerçek mağaza ürün sayfasında fiyat, SKU, varyantlar, adet ve benzer ürünler bulunuyor. Önizleme `composition.productDetail` ayarlarını uygulamadığı için galeri/marka/SKU seçenekleri burada değerlendirilemiyor.

Header sabit Ana Sayfa / Ürünler; sepet sabit Çanta 0. Gerçek mağaza header ve sepeti farklı bileşenlerle ayarları tüketiyor.

Mobil düğmesi yalnız tuval genişliğini 390 px yapıyor. Banner mobil görseli ise dış tarayıcı penceresinin media koşuluyla seçiliyor; geniş masaüstü penceresinde mobil tuval masaüstü görselini kullanabiliyor.

Öneri: gerçek mağazayla ortak bileşenler, seçilebilir temsilî ürün ve önizleme moduna açıkça bağlı görsel seçimi. Temsilî ürün seçimi ortak şablonu değiştirmemeli veya ürüne özel şablon ataması sayılmamalı.

Kanıt: [statik ürün önizlemesi](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx:240), [sabit header ve görsel media koşulu](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:69).

### D06 — Duyuru için iki ayrı kayıt düzenleniyor — P2

Ana form `composition.announcement`, gelişmiş form `design.announcement` yazıyor. Önizleme ikinciyi kullanıyor. Yayın sürümü 1'den büyük olduğunda gerçek ana sayfa da ikinci kaydı kullanan renderer'a geçiyor. Ana formdaki mesaj veya görünürlük değişikliği beklenen şeride yansımayabilir.

Öneri: bir duyuru kaydı; basit ve gelişmiş alanların aynı kaydı düzenlemesi.

Kanıt: [ana form](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/StarterThemeComposer.tsx:272), [gelişmiş form](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/DesignInspector.tsx:48), [canlı seçim](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/storefront-shared/components/CampaignHome.tsx:30).

### D07 — Banner kapalı olsa da yayın zorunluluğu sürüyor — P1

Hem istemci hem canlı SQL, `hero.enabled=false` durumunu dikkate almadan en az bir açık ve görselli slayt istiyor. Ürünlerden oluşan veya bannersız bir ana sayfa bu yüzden yayımlanamayabilir. Oysa modüler ana sayfa tasarım belgesi bannerın kapatılabilmesini ve boş bölüm listesini destekliyor.

Siora'nın mevcut taslağında genel banner açık, slayt gizli; mevcut engel bu durum için anlaşılabilir. Hata, banner bilinçli kapatıldığında da aynı zorunluluğun sürmesidir. Ayrıca bölüm listesi “Açık”, tuval “Banner alanı kapalı” göstererek karışıklık yaratıyor. Slayt checkbox'ında gerçek ters bağlama yok; “Gizli” durum etiketiyle bir açma kontrolünün birleşmesi belirsiz.

Kanıt: [istemci yayın doğrulaması](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/packages/saas-contracts/src/storefront-design/validation.ts:314), [SQL yayın doğrulaması](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202608110100_modular_homepage_builder.up.sql:179). Canlı fonksiyon gövdesi de aynı zorunluluğu doğruladı.

### D08 — Geri al sonraki düzenlemeleri kaybettiriyor — P1

Silme işlemi bütün kompozisyonun eski kopyasını saklıyor. Sonrasında başka bölüm değiştirildiğinde geri alma kaydı temizlenmiyor. “Geri al” yalnız silinen bölümü değil eski kompozisyonun tamamını geri yüklüyor; sonraki değişiklikler kayboluyor ve geri yüklenen taslak otomatik kaydediliyor.

Bellek içi deneme: hikâye bölümünü sil → kalan ürün başlığını “Silme sonrası yeni başlık” yap → geri al. Başlık tekrar “Yeni ürünler” oldu.

Öneri: yalnız silinen bölümü ve yerini geri getiren işlem; diğer değişikliklerin korunması ve çakışma kontrolü.

Kanıt: [UI geri alma](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:192), [kompozisyon kopyası](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/homepage-command-model.ts:144).

### D09 — Kampanya kartı değişiklikleri bazı metinleri siliyor — P2

Görsel veya bağlantı handler'ı paneli yeniden oluştururken kayıtlı `eyebrow/body` alanlarını taşımıyor. Eski içerikte üst başlık/açıklama varsa kaybolabilir. Yeni boş kampanyada önce ikinci kartı doldurmak da seyrek panel dizisi oluşturarak doğrulama hatasına düşüyor.

Kanıt: [kampanya alanları](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:95).

### D10 — Düzenleme sınırları yararlı alan hatası vermiyor — P2

Boş başlık, dokuzuncu kategori ve dört ürün bölümü varken çoğaltma gibi ara durumlar katı normalizer'da hata üretiyor. Handler'larda yakalama/alan hatası yok. Bölüm ekleme butonu ürün sınırını gözetirken çoğaltma butonu gözetmiyor. Geçici boş girişin düzenleme sırasında temsil edilebilmesi ile kayıt/yayın geçerliliği ayrı ele alınmalı.

Kanıt: [update handler](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:147), [çoğaltma](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:191).

### D11 — Kampanya saati okuma ve yazmada kayıyor — P2

Kayıtlı UTC zamanı doğrudan kesilip `datetime-local` alanına veriliyor. Girilen değer ise tarayıcı yerel saatine göre UTC'ye çevriliyor. İstanbul'da 12:00 girişi 09:00Z kaydolup yeniden çizimde 09:00 görünebilir. Mağaza saat dilimi etiketi bu dönüşümü uygulamıyor.

Kanıt: [zaman dönüşümü](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/DesignInspector.tsx:36).

### D12 — Kategori banner hedefi 404 üretiyor — P2, canlı doğrulandı

Canlı hedef çözücüsü Pantolon / Jean&Denim kategorisi için `/collections/pantolon-jean-denim` üretti. Bu adres tarayıcıda **404 / Mağaza veya ürün bulunamadı** gösterdi. Aynı kategori gerçek mağazada `/kategori/pantolon-jean-denim` adresinde mevcut.

SQL `/collections/` üretiyor; ortak mağaza localizer'ı bu yolu `/kategori/` adresine çevirmiyor. Sayfa hedeflerinde `/pages/` için de statik rota uyuşmazlığı riski var; sayfa hedefi için canlı 404 denemesi yapılmadı.

Öneri: banner, menü, footer ve önizlemenin kullandığı tek kanonik hedef çözümlemesi; gerçek rota doğrulaması.

Kanıt: [hedef çözücüsü](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202608030081_storefront_design_workspace.up.sql:299), [rota dönüşümü](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/storefront-shared/lib/storefront-routes.ts:36).

### D13 — Otomatik ürün listeleri uygun ürünleri eksik getirebilir — P2

- **İndirimli satır:** Önce genel katalogdan ilk 48 ürün, sonra indirim filtresi alınıyor. İlk 48 dışında kalan eski indirimli ürünler bölüme ulaşmıyor.
- **Kategori satırı:** Önce ortak kategori sırasına göre ilk 4/8/12 ürün, sonra ana sayfada stok filtresi uygulanıyor. İlk sıralarda stok dışı ürün varsa daha sonraki uygun ürünlerle doldurulmuyor.

İki sorgu biçimi canlı veritabanındaki fonksiyonlarda doğrulandı. Büyük katalog/stok senaryosu üretmek için canlı veriye yazılmadı.

Öneri: uygunluk/indirim filtresini limitten önce uygulamak; sıralamayı deterministik tutmak. Manuel seçimde otomatik başka ürünle değiştirme yapılacaksa bunun kuralı kullanıcıya açık olmalı.

Kanıt: [indirim taraması ve stok filtresi](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202608210113_homepage_available_product_rows.up.sql:19), [kategori sırası ve limit](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/owner/scripts/sql/saas/202609250154_category_product_public_order.up.sql:35).

## 4. İkinci aşamada ele alınacak noktalar

- **Bölüm aralığı:** `sectionSpacing` aktif arayüzde düzenleniyor, ortak canlı renderer/CSS tarafından tüketilmiyor. [Kontrol](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/StarterThemeComposer.tsx:260).
- **Taslak/yayın karşılaştırması:** Açılışta taslak koşulsuz “Kaydedildi” durumunda; tam yayımlanmış kompozisyon workspace sözleşmesinde yok. Kalıcı “kaydedildi ama yayında değil”, fark gösterimi ve yayındaki tasarıma dönme akışı eksik. [Başlangıç durumu](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/workspace-model.ts:8).
- **Yorum önizlemesi:** Taslak yorumlar bölümü gerçek kaynak yüklenmeden `unavailable` üretiliyor. [Projeksiyon](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/lib/storefront-design-preview-model.ts:255).
- **İç içe ayar panelleri:** İç bölüm paneli Escape olayını durdurmuyor; dış panel de pencere seviyesinde aynı olayı dinliyor. İç panel odağı kendi içinde tutmuyor. Kaynak düzeyinde klavye/odak riski; bu auditte canlı klavye senaryosu ayrıca denenmedi. [İç panel](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/HomepageBuilder.tsx:210), [dış panel](/Users/Celebix/.codex/worktrees/toshi-ai-assistant/Saas-Celebix/apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx:24).
- **Eski banner otoritesi:** Top-level banner aktif olduğunda kompozisyondaki eski hero bölümleri kaldırılıyor. Yeni arayüz sabit üst banner kullanıyor; bu bulgu eski içerik taşınması için risk olarak ele alınmalı. Kullanıcıya mevcut arayüzde bannerı alt sıraya taşıyabildiği vaat edilmemeli.
- **Önbellek:** Yayın sonrası yenileme yolu mevcut. Yenileme başarısızlığı yutuluyor; ayrı cache'lenen tasarım ile doğrudan okunan kompozisyonun geçici karışma olasılığı var. Canlı olay doğrulanmadığı için bunu gerçekleşmiş hata olarak sınıflandırmıyorum.
- **Kargo ilerleme seçeneği:** Arayüzde bilinçli devre dışı ve açıklamalı. Aktif olup çalışmayan özellik olarak raporlanmamalı.

## 5. Önerilen uygulama sırası

### Paket 1 — Yayın ve düzenleme doğruluğu

Kategori vitrini ve duyuru için tek içerik kaynağı; kategori görseli bağlama; banner kapalıyken doğru yayın doğrulaması; bölüm bazlı geri alma; kampanya metinlerini koruma; bağlantı rotaları ve saat dönüşümü. Hatalar etkilenen alanı göstermeli. Bu paket, yanlış tasarım yayınlama ve düzenleme kaybını önler.

### Paket 2 — Kullanıcının istediği ürün seçimi

Ürün bölümünde otomatik veya elle seçim. Kategori filtresi altında ad/SKU/barkod araması. Seçilen ürünleri ayrı listede gösterme, çıkarma ve sıralama. Aynı bölümde tekrar eden ürünleri önleme. Seçimin panel, taslak, yayın ve mağaza sorgusunda aynı sırayı koruması. Mağazalar arası ürün seçimini sunucuda reddetme. Pasif veya stok dışı ürün durumunu anlaşılır biçimde açıklama.

Otomatik kaynaklar korunabilir; mevcut kullanıcıların kategoriden otomatik getirme davranışı değişmeden elle seçim eklenmeli. Bu özellik yalnız bir ürün seçme kutusu eklemekle tamamlanmaz; sözleşme, SQL, önizleme ve canlı görüntü birlikte geliştirilmelidir.

### Paket 3 — Gerçek sonuç veren önizleme

Ortak header/ürün/yan sepet bileşenleriyle taslak önizleme; temsilî gerçek ürün seçicisi; güvenilir mobil görsel; kategori bağımlılık anahtarı; gerçek yorumlar; bölüm aralığı; taslak/yayın karşılaştırması. Ürün önizleme seçimi yalnız editör durumunda kalmalı.

### Kabul ölçütleri

1. Bir kategori içinden seçilen ürünler, seçilen sıra ile hem taslakta hem yayında görünür; başka mağazanın ürünü kabul edilmez.
2. Kategori başlığı, düzeni ve listesi yayımlandığında eski vitrin kaydı tarafından değişmez.
3. A'dan B kategorisine geçince kaynak yenilenir; geçici eksiklik/yüklenme açık gösterilir.
4. Banner kapalı ana sayfa yayımlanır; açık ama eksik banner kendi alanında açıklayıcı hata verir.
5. Bir bölümü geri getirmek sonrasında yapılan başka düzenlemeleri korur.
6. Kampanya görseli/hedefi değiştirmek mevcut başlık ve açıklamayı korur; ikinci kart önce doldurulabilir.
7. Ürün ayarı değişikliği gerçek ürün önizlemesinde görülür; mobil görsel mobil modda seçilir.
8. Kategori hedefi gerçek mağaza sayfasına gider; mağaza saat dilimindeki zaman yeniden açılışta değişmez.
9. İndirimli/uygun ürünler katalog büyüklüğünden veya stok dışı üst sıralardan dolayı gereksiz yere dışarıda kalmaz.
10. Kaydedilmiş taslak ile yayındaki tasarım farkı yeniden açılışta anlaşılır.

## 6. Doğrulama ve dış referanslar

Canlı panelde ürün kaynak menüsü, banner/yayın durumu ve ürün tasarım kontrolleri okundu. Yayımlanan ana sayfa, gerçek ürün sayfası ve kategori adresleri karşılaştırıldı. Veritabanı incelemesi salt okunur işlemlerle yalnız ilgili tasarım sürümü/görünürlük bayrakları ve fonksiyon gövdelerini kapsadı.

Bellek içi model denemeleri ürün kimliklerinin reddedilmesini, kategori bağımlılık anahtarının değişmemesini, geri almanın başlığı kaybettirmesini ve kategori vitrini başlık/düzeninin ayrı kaynaktan gelmesini doğruladı. İlgili sözleşme, UI/kayıt akışı, ana sayfa, ürün detay ve renderer test grupları geçti. Testler arasında ortak kapsam olduğundan tek bir toplam test sayısı verilmedi. Geçen mevcut testler bu bulguların tüm kullanıcı senaryolarını kapsadığı anlamına gelmez; bazı testler mevcut sorunlu davranışı özellikle bekliyor.

Güncel resmi karşılaştırma:

- Shopify, ürünleri koşullarla otomatik ekleme ile belirli ürünleri elle seçerek ekleme yollarını belgeliyor. Celebix'te otomatik ve elle seçim önerisi bu iki ihtiyacı karşılamak için yapılmıştır. [Creating collections and adding products](https://help.shopify.com/en/manual/products/collections/create-collection).
- Shopify, bir şablonun onu kullanan sayfaları etkilediğini ve editörde uyumlu gerçek ürün seçerek önizlenebildiğini belgeliyor. Celebix için ortak ürün şablonu ve ayrı temsilî ürün seçicisi önerilmiştir. [Templates](https://help.shopify.com/en/manual/online-store/themes/theme-structure/templates).

Bu araştırma sırasında uygulama düzeltmesi veya dağıtım yapılmadı. Rapor, sonraki uygulama paketinin kapsamını ve kabul ölçütlerini belirler.
