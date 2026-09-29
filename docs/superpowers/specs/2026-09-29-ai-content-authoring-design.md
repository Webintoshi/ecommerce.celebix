# Celebix yapay zekâ ile içerik üretimi: araştırma ve önerilen tasarım

**Tarih:** 29 Eylül 2026

**Durum:** Kullanıcının istediği araştırma ve planlama tamamlandı; bu özellik için uygulama veya canlı yayın yapılmadı.

**Kaynak incelemesi:** d09f7f6c; aktif SaaS Customer Panel ve ortak storefront.

**Amaç:** Mağazanın gerçek bilgilerinden ürün açıklaması, SEO başlığı/açıklaması, blog ve diğer metinler için incelenebilir taslaklar üretmek.

## 1. Araştırmanın tasarıma etkisi

- Google, AI içeriğinde doğruluk, kalite ve kullanıcıya faydayı vurguluyor. Fayda eklemeden çok sayıda sayfa üretmek spam politikasıyla çelişebilir. Tasarımımız ürüne özgü bilgiyi kullanmalı; yalnızca farklı kelimelerle aynı satış paragrafını çoğaltmamalı. [Google AI içerik rehberi](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- Google başlık ve meta açıklamalarında sabit karakter sınırı koymuyor; görünen sonuç cihaz genişliğine göre kesilebilir ve yeniden oluşturulabilir. Panelde 50–60 karakter başlık, 140–160 karakter meta açıklama birer yazım hedefi olacak. Depolama sınırları ayrı uygulanacak; arama sonucunun birebir gösterimi veya sıralama garantisi verilmeyecek. [Başlık](https://developers.google.com/search/docs/appearance/title-link), [Açıklama](https://developers.google.com/search/docs/appearance/snippet)
- Shopify da editör içinde ürün bilgileri ve marka diliyle taslak üretimi kullanıyor. Kendi belgesi benzer ürünlerden hatalı özellik/fayda türetilebildiğini belirtiyor. Celebix önerisi, girilmiş ölçü ve nitelikleri otomatik kullanıp sonucu uygulamadan önce göstermektir. [Shopify ürün açıklaması](https://help.shopify.com/en/manual/products/details/product-descriptions/shopify-magic)
- DeepSeek JSON Output için json_object, açık JSON talebi ve uygun çıktı bütçesi gerekiyor; boş çıktı ihtimali belgelenmiş. JSON biçimi tek başına doğruluk sağlamaz. Sağlayıcı yeteneğine uygun üretim ve sunucuda bağımsız doğrulama gerekir. [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- Merchant Center'a aktarılacak AI ürün başlığı/açıklamasında structured_title / structured_description ve trained_algorithmic_media kaynağı gerekiyor. Bu, SEO meta alanlarından ayrı bir feed sözleşmesidir. İlk fazda alan bazında üretim kaynağı saklanmalı; Merchant feed entegrasyonu ayrı iş olarak ele alınmalı. [Google Merchant AI verisi](https://support.google.com/merchants/answer/14743464?hl=en-GB)
- Ürün notları, mevcut metin ve araştırılan sayfalar talimat değil, veri olarak işlenmeli. Üreticiye mağaza değiştirme, anahtar okuma veya yayınlama aracı verilmemeli. [OWASP prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

Bu maddeler kaynak bulgularıdır. Aşağıdaki ekran, sınırlar ve teslim aşamaları Celebix için önerilen tasarım kararlarıdır.

## 2. Gerçek kodda bulunan durum

| Konu | Bulgu | Plana etkisi |
|---|---|---|
| Görseldeki toolbar | Customer Panel ProductDescriptionField, TipTap | Aynı araç çubuğuna tek AI eylemi eklenir. |
| Ürün açıklaması | Normalize edilmiş HTML, biçimlendirmeyle birlikte 10.000 karakter | Üretim mevcut güvenli biçime dönüştürülür; limit korunur. |
| Ürün SEO | seoTitle 200, seoDescription 500 karakter | Yumuşak SEO önerileri ile kayıt sınırları ayrılır. |
| Mağazada ürün metadata | Ürün adı ve ham açıklama kullanılıyor; ürün SEO alanları public üründe yok | SEO projection ve gerçek meta etiketleri ilk faza dahil edilir. |
| Blog/sayfa editörü | Generic textarea 4.000 karakter | Ortak rich text adaptörü ve uzun içerik sözleşmesi gerekir. |
| Generic config | String başına 4.000 UTF-8 bayt; LF/CR reddediliyor | Türkçe ve çok paragraflı blog için mevcut config'i topluca gevşetmek yerine ayrı içerik gövdesi gerekir. |
| Ortak mağazada blog | Blog liste/detay rotası ve repository okuma zinciri yok | Blog fazı gerçek mağaza yayınına kadar tamamlanmalıdır. |
| Sayfa metadata | Başlık/canonical/robots var; açıklama yok | Sayfa SEO tüketimi blog/sayfa fazında tamamlanır. |
| AI bağlantıları | Şifrelenmiş mağaza anahtarları; DeepSeek/OpenAI/Gemini/Anthropic adaptörleri | Aynı bağlantılar sunucuda kullanılır. |
| AI tercihi | tone/locale/enabledFeatures tanımları var; üretim tüketimi bulunmadı | Mağaza yazım tercihleri gerçek üretim servisine bağlanır. |
| Maliyet | Adaptör token usage döndürüyor; sohbet servisi kalıcı kullanım kaydı tutmuyor | İçerik üretimi için işlem bazında kullanım ve mağaza limiti eklenir. |
| Taslaklar | Ürün taslağı React belleğinde; yenilemeyle geri yüklenen taslak değil | AI sonucu kalıcı özel işlem kaydında tutulur; ürün formunun tamamına otomatik kayıt vaadi verilmez. |

### Başlıca kaynak dosyaları

- apps/customer-panel/components/catalog/ProductDescriptionField.tsx
- apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx
- apps/customer-panel/components/catalog/ProductDetailConsole.tsx
- apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx
- apps/customer-panel/lib/catalog-ui/product-draft-session.ts
- apps/customer-panel/lib/server-toshi-providers/runtime.ts
- apps/customer-panel/lib/toshi-generation/{types,registry,policy,deepseek}.ts
- apps/customer-panel/lib/merchant-admin-ui/presentation.ts
- packages/platform-config/src/product-description-rich-text.ts
- packages/saas-contracts/src/{catalog-onboarding,merchant-admin,storefront}/
- packages/saas-data/src/{storefront,storefront-content}/
- apps/storefront-shared/app/products/[slug]/page.tsx
- apps/storefront-shared/app/pages/[slug]/page.tsx

Legacy apps/admin/app/api/seo/generate/route.ts mevcut ancak eski anahtar ayarları, ham yanıt logları, regex ayrıştırma ve varsayımsal ürün/anahtar kelime iddiaları içeriyor. Yeni SaaS servisinin temeli olarak alınmayacak.

## 3. Yaklaşım seçimi

| Seçenek | Kazanç | Sınırlama |
|---|---|---|
| Her alana bağımsız prompt/buton | İlk ekran hızlı çıkar | Kalite, maliyet ve alan kuralları tekrar eder. |
| Toshi sohbetinden içerik istemek | Bağlantılar hazır | Belirli form, seçim, ürün sürümü ve geri alma akışına bağlı değil. |
| Ortak içerik üretim servisi ve editör adaptörleri | Tüm içeriklerde ortak kalite/bağlantı; alanlara özgü çıktı | İlk fazda açık sözleşme ve işlem kaydı gerekir. |

**Öneri:** Üçüncü seçenek. Toshi'nin anahtar/sağlayıcı altyapısı yeniden kullanılır; sohbet geçmişi ve müşteri/sipariş araçları içerik üretimine taşınmaz. İlk faz için ayrıca vector database veya otomatik internet taraması gerekmez.

## 4. Sade kullanım akışı

1. Görseldeki araç çubuğuna **Yapay zekâ ile yaz** menüsü eklenir. SEO alanlarında da aynı paneli açan kısa eylem olur.
2. İlk eylemler: **Açıklama oluştur**, **Metni geliştir**, **Seçili metni düzenle**, **Kısalt**, **SEO oluştur**. Çeviri ve diğer içerik türleri sonraki faza genişletilir.
3. Açılan panel mevcut ürün adını, kategori ve önemli girilmiş özellikleri özetler. İsteğe bağlı kısa talimat, dil, marka dili ve kısa/normal/detaylı tercihi bulunur. Varsayılanlarla tek tıklama yeterlidir.
4. Ürün açıklaması, SEO başlığı ve SEO açıklaması bir istekle hazırlanabilir. Kullanıcı üretilecek alanları seçer; gereksiz çıktı için model çağrısı yapılmaz.
5. Sonuç önce önizlenir. Kullanıcı yalnız istediği alanları **Uygula** ile mevcut form taslağına alır, ardından mevcut kaydetme/yayınlama akışını kullanır.
6. Açıklama uygulaması editörde tek işlem olarak geri alınır. Seçili metin işlemi tüm açıklamayı değiştirmez.
7. Kullanıcı üretim sürerken metin veya ürün bilgilerini değiştirirse eski sonuç sessizce üzerine yazılmaz; güncel bilgilerle yeniden üretme seçeneği gösterilir.
8. Mobilde panel ekrana sığar; klavye, odak geri dönüşü ve ekran okuyucu etiketleri desteklenir. Tekrarlanan sayfa başlıkları/dekoratif açıklamalar eklenmez.

Yeni ürün ve mevcut ürün düzenleme birlikte desteklenir. Düzenlemede açıklama ve merchandising SEO ayrı sürüm/kaydetme alanlarına bağlıdır; UI her alanın uygulanmış/kaydedilmemiş durumunu ayrı doğru göstermelidir. Üç alana uygulama, üç alanın veritabanına atomik olarak kaydedildiği iddiası taşımaz. İlk faz mevcut kaydetme yetki ve sürüm denetimlerini korur.

## 5. Ürün açıklamasının bilgi modeli

### Kullanılacak bilgiler

- Ürün adı, girilmiş marka ve kategori; kategori ürün türünü anlamaya yardım eder.
- Girilmiş malzeme, renk, model, uyumluluk ve doğrulanmış kullanım/bakım bilgileri.
- Varyant özellikleri ve varyanta bağlı ölçüler; ortak özellik ile varyant özelliği ayrılır.
- İsteğe bağlı ağırlık, hacim, uzunluk, en/boy/yükseklik, alan ve paket içeriği.
- Mevcut formun kaydedilmemiş değerleri; yalnız eski veritabanı kaydı kullanılmaz.
- Satıcının eklediği notlar ve hedef müşteri/marka dili. Notların içindeki model talimatları yürütülmez.

Müşteri/sipariş verisi, API anahtarı, alış maliyeti ve kâr bilgisi bu pakete girmez. Fiyat, stok ve kampanya gibi değişken bilgiler kalıcı açıklamaya varsayılan olarak yerleştirilmez; ayrı mağaza alanlarında kalır.

### Üretim kuralları

- Ürünün girilmiş gerçeklerini anlaşılır biçimde anlat; müşteri açısından seçimde ne işe yaradığını açıkla.
- Açıklama yapısı: kısa tanıtım → ayırt edici özellikler → ölçüler/paket içeriği → varsa doğrulanmış kullanım/bakım bilgisi. Bilgi yoksa ilgili bölüm yazılmaz.
- Ürüne göre uzunluk belirle; az veriyi zorla yüzlerce kelimeye uzatma. Detaylandırma yeni teknik gerçek yaratamaz.
- Gram/ölçü hassasiyeti ve birimi korunur. Örneğin 14,89 g, Türkçe gösterimde 14,89 gramdır. Depolama biriminin dönüşümü sözleşmeden yapılır; kayan noktayla sayı uydurulmaz.
- Net/brüt ağırlık, parça başına/paket başına kapsam ancak kayıtlıysa kullanılır.
- Ayar, taş, sertifika, alerjen, sağlık faydası, organik/hipoalerjenik/su geçirmez, menşe, garanti ve teslimat iddiası kaynaksız yazılmaz. Görsel veya benzer ürün bunları doğrulamaz.
- Satıcının kayıtlı alanları çelişiyorsa ilgili iddia çıkarılır ve kısa doğrulama isteği gösterilir. Bir varyantın rengi/bedeni tüm ürüne genellenmez.
- Ürün nitelikleri isteğe bağlı kalır. Eksik veride daha kısa taslak ve isteğe bağlı bilgi önerileri verilir; kullanıcı bütün nitelikleri doldurmaya zorlanmaz.
- Aynı ürün için gereksiz tekrar ve anahtar kelime yığını oluşturulmaz. Gerçek arama hacmi/rekabet verisi olmadan anahtar kelime araştırması yapılmış gibi gösterilmez.

### Kuyumcu örneği

**Girdi:** Burgu bileklik, ağırlık 14,89 g; malzeme/ayar/taş bilgisi boş.

**Önerilen kısa taslak:** “Burgu bileklik, 14,89 gram ağırlığındadır. Modelin ağırlık bilgisini diğer seçeneklerle karşılaştırarak tercihinizi yapabilirsiniz.”

**SEO başlığı:** “Burgu Bileklik – 14,89 g”. Altın/14 ayar/pırlanta eklenmez.

Satıcı ayrıca 14 ayar altın, sarı renk ve 19 cm uzunluk girerse bunlar metne alınabilir. Taş bilgisi boşken “taşsız” da yazılmaz. Bu örnek tarafımızdan hazırlanmış gösterimdir; gerçek bir model çağrısı yapılmamıştır.

## 6. SEO, blog ve diğer içerikler

### Ürün SEO

- SEO başlığı ürünü ve gerçekten ayırt edici özelliği anlatır; mağaza adı ekleme kuralı bir kez uygulanır.
- Meta açıklama ürünün kısa ve doğru özetidir; HTML içermez.
- Gerçek mağazada kayıtlı SEO alanları kullanılır; boşsa ürün adı ve açıklamanın güvenli düz metin özeti kullanılır. Canonical ve index ayarları korunur.
- Arama sonucu önizlemesi yaklaşık gösterimdir; Google'ın gösterimini garanti etmez.

### Blog ve sayfa

- Blog akışı: konu/amaç → başlık planı → kullanıcı incelemesi → yazı/özet/SEO taslağı → önizleme → normal yayınlama.
- Kaynak isteyen güncel/teknik iddialarda kullanıcı kaynakları veya açık araştırma modu kullanılır. Modelin kendiliğinden yazdığı URL doğrulanmış kaynak kabul edilmez.
- Araştırma modu blog fazında sınırlı kaynak alma, SSRF denetimi, içerik boyutu/süre sınırı, kaynak kaydı ve maliyetle tasarlanır. Araştırılmış genel bilgi, belirli bir ürünün teknik özelliği sayılamaz.
- Ayrı uzun içerik gövdesi önerisi: normalize edilmiş UTF-8 HTML için en fazla 80.000 bayt. Alan doğrulaması, API, SQL, editör sayacı ve mağaza renderer aynı sınırı kullanır. Paragraf/satır sonları desteklenir; script ve güvenli olmayan bağlantılar reddedilir. Generic config'in 4.000 bayt sınırı diğer kayıtlar için korunur. Mevcut yayımlanmış kısa/plain text veya HTML body kayıtları uyumlu okunur; yeni gövdeye geçiş eski sayfa içeriklerini ve sürüm geçmişini kaybetmez.
- Ortak storefront'ta blog liste/detay, yayın durumu, slug, dil, canonical, meta açıklama ve sitemap bağlantısı tamamlanır. Taslak/arşiv kayıtları public okunmaz.
- Ürün açıklaması editörü ürün sözleşmesini korur; blog adaptörü ayrı gövde sınırını kullanır. Bütün editörleri tek seferde değiştirmek gerekmez.

### Diğer içerikler

| İçerik | Girdi | Çıktı |
|---|---|---|
| Kategori/koleksiyon | Gerçek ürün grubu ve kategori bilgisi | Giriş metni + SEO |
| Marka/mağaza hakkında | Satıcının gerçek hikâyesi ve bilgileri | Sayfa taslağı + SEO |
| Banner/duyuru | Gerçek teklif, süre ve hedef | Başlık, kısa açıklama, eylem metni |
| E-posta/kampanya | Doğrulanmış kampanya kuralları | Başlık ve mesaj taslağı |
| Diğer metinler | Alan türü ve mevcut içerik | Düzeltme/kısaltma/çeviri |

Politika metni gerçek mağaza koşullarından taslaklanır; süre ve haklar uydurulmaz. Müşteri yorumu, yapılmamış deneyim veya olmayan kuruluş hikâyesi üretilmez. SKU, barkod, fiyat, stok, adres ve şifre gibi alanlar yazı üretim kapsamına dahil edilmez. AI içerik üretimi mesaj gönderme veya kendiliğinden yayınlama işlemi değildir.

## 7. Servis ve kayıt tasarımı

- İçerik amacı için ayrı server-only servis: içerik türü, hedef alanlar, doğrulanmış mevcut taslak, dil/ton, işlem kimliği ve kaynak fingerprint'i.
- Mağaza, kullanıcı, aktif üyelik ve düzenleme yetkisi sunucuda çözülür. Kayıtlı ürünün ve taslaktaki kategori/marka/nitelik/varyant kimliklerinin mağazaya aidiyeti doğrulanır; yeni taslak yalnız izinli alanlara göre doğrulanır. Kullanıcının boşalttığı/sildiği bir alan eski DB değerine fallback yapmaz; omit, boş ve silme semantiği ayrı tanımlanır.
- Mevcut aktif AI bağlantısı kullanılır; aynı işlemde provider/model/credentialVersion sabitlenir. Anahtar yalnız sunucuda açılır. Başka sağlayıcıya sessiz geçiş yapılmaz.
- Adaptörler içerik amacı için JSON çıktı yeteneği kazanır; Toshi'nin mevcut sohbet davranışı ve limitleri değişmez. Sağlayıcı destekleri aynı varsayılmaz.
- Model ham HTML yerine şemalı metin blokları/alanlar döndürür. Sunucu blokları izinli biçime çevirir; mevcut sanitizer/renderer kullanılır. SEO düz metin olarak doğrulanır.
- Deterministik kontroller sayı/birim, kaynakta olmayan özellik alanları, alan sınırları, format ve bağlantıları denetler. Modelin “dayandığım bilgiler” listesi kanıt değildir; sunucu kendi kaynağıyla karşılaştırır. Serbest metindeki bütün anlamsal hataların otomatik yakalanacağı iddia edilmez; önizleme ve gerçek model değerlendirmeleri gereklidir.
- PostgreSQL işlem kaydı: mağaza+kullanıcı, operationId, kaynak fingerprint, provider/model, prompt sürümü, durum, doğrulanmış özel taslak sonucu, nullable token usage, güvenli hata kodu ve zamanlar.
- Aynı işlem kimliği tekrar gelirse mevcut durum/sonuç döner; aynı kimlikle farklı girdi reddedilir. Dış çağrıdan önce atomik dispatch claim ve fencing token kaydedilir; complete/fail aynı claim ile koşullu yazılır. Dispatch öncesi crash ile dispatch sonrası belirsizlik farklı ele alınır. Sonucu belirsiz dış çağrı otomatik tekrar gönderilmez. Yeni üretim açık kullanıcı eylemidir ve yeni maliyet oluşturabilir.
- Başlangıç önerisi: mağaza başına yapılandırılabilir 100 üretim denemesi/gün, kullanıcı+mağaza başına 6/dakika ve 1 aktif içerik işlemi. En fazla 32.768 bayt ürün girdi paketi, 4.096 çıktı tokenı ve 45 saniye toplam deadline. Tamamlanmayan/kesilmiş çıktı kullanılmaz; limitleri mağaza kullanımına göre görünür biçimde ayarlamak mümkün olur.
- İşlem sonucu ve kullanım yalnız ilgili mağaza/kullanıcıya okunur; anahtar, ham sağlayıcı zarfı veya müşteri verisi loglanmaz. Eksik token usage sıfır olarak kaydedilmez.
- Uygulanan alanların AI kaynağı kaydetme akışında generationId ve sunucuda hesaplanan içerik hash'leri ile izlenir. Her alanın kaydı ve kaynak ilişkisi aynı transaction'da yazılır; açıklama/profile kayıtlarının ayrı başarı durumları korunur. İşlem kayıtlı ürüne veya yeni ürünün draftId'sine bağlanır; ürün oluşturulunca bu ilişki aynı transaction'da ürün kimliğine taşınır.
- Sonraki elle düzenleme geçmişi silmez; AI destekli türetim korunur. Undo/redo mevcut metinle birlikte alanın geçerli kaynak durumunu geri getirir; manuel metne dönülünce yanlış AI origin bırakılmaz. Kalıcı geçmiş ayrıca korunur. Kaydedilmeyen öneri mağaza ürünü sayılmaz.

## 8. Teslim aşamaları

### Faz 1 — Ürün açıklaması ve ürün SEO

Bağlantı yeniden kullanımı, gerçek ürün taslağından üretim, önizleme/uygulama/geri alma, işlem kaydı ve kullanım limiti, alan bazlı kaynak bilgisi; SEO'nun gerçek storefront metadata'sına bağlanması. Yeni ürün ve ürün düzenleme, bütün ortak admin panellerinde desteklenir.

### Faz 2 — Blog ve sayfalar

Uzun içerik sözleşmesi ve rich text adaptörü; başlık planı/yazı/özet/SEO; blogun ortak storefront yayın ve sitemap zinciri; sayfa meta açıklaması. Kaynaklı araştırma modu ayrı eylem ve ölçülebilir maliyetle eklenir.

### Faz 3 — Diğer içerikler ve toplu çalışma

Kategori/marka/banner/kampanya alan adaptörleri; marka dili ve çeviri; günlük token bütçesi, sıraya alınan toplu üretim, alan bazında inceleme ve uygulama. Toplu üretim otomatik yayın yapmaz. Merchant feed üretim kaynağı entegrasyonu feed işiyle birlikte tamamlanır.

## 9. Kabul ölçütleri

- [ ] Yeni/kayıtlı ürünün mevcut taslağı kullanılır; bütün ölçüler isteğe bağlı kalır.
- [ ] 14,89 g, 0,25 kg, uzunluk ve paket adedi anlam/hassasiyet kaybı olmadan işlenir; varyant kapsamı korunur.
- [ ] Bilinmeyen altın ayarı, taş, sertifika ve teslimat iddiası eklenmez; eksik veri daha kısa taslağa izin verir.
- [ ] Üretim sonucu yalnız seçilen alanlara uygulanır; manuel kaydetme tamamlanmadan “kaydedildi” gösterilmez.
- [ ] Beklerken metin/ürün bilgisi değişirse eski sonuç yeni taslağı ezmez; açıklama tek adımda geri alınır.
- [ ] Hatalı/boş/kesilmiş JSON, timeout veya kota hatası mevcut içeriği değiştirmez.
- [ ] Çift tıklama/aynı operationId yeniden okuması ikinci model çağrısı oluşturmaz; belirsiz çağrı otomatik yeniden gönderilmez.
- [ ] Başka mağazanın ürünü, önerisi veya anahtarı kullanılamaz; injection metni yayın/mağaza okuma yetkisi kazanmaz.
- [ ] HTML/link biçimleri güvenlidir; SEO gerçek mağaza meta etiketlerinde düz metin olarak görünür; marka eki çoğalmaz.
- [ ] Türkçe ve Unicode çok paragraflı blog sınırı UI/API/SQL/storefront'ta aynı ölçülür; taslak blog public okunmaz.
- [ ] 390 px ekran, klavye/odak ve mevcut manuel editör akışı doğrulanır.
- [ ] Takı, moda, gıda, elektronik ve dekorasyondan en az 5'er doğrulanmış örnekle gerçek model değerlendirmesi yapılır; sayısal tutarlılık, desteksiz iddia, fayda ve tekrar ayrı ölçülür. Değerlendirmede kritik ürün iddiası hatası yayını durdurur; yalnız mock/JSON testi kalite kanıtı sayılmaz.
- [ ] Mağaza genelinde açılıştan önce pilot sonuçları ve maliyet kaydı incelenir; flag ile AI eylemleri kapatılınca mevcut manuel içerik çalışmaya devam eder.

## 10. Yayın ve geri dönüş

Planlama aşamasında canlı sistem değişmez. Uygulama aşamasında migration numarası güncel repository'den seçilir; mevcut migration düzenlenmez. Public projection v1 korunur, yeni SEO okuması v2 ile eklenir; eski strict parser kullanan storefront'lara fazladan alan gönderilmez. Uyumlu ortak storefront sürümü ve Customer Panel, özellik kapalıyken dağıtılır; pilot sonrası mağaza bazında açılır. Geri dönüşte AI özelliği kapatılır ve eski public okuma yolu korunur; kullanıcının daha önce kaydettiği içerik silinmez.
