# Toshi gerçek AI asistanı — ortak panel yayını

## Kaynak ve özellikler

İlk yayın dalgasının kaynağı `919d4c72c56951f592772588da1d17321743ed18`, dal `codex/toshi-ai-assistant`. Bu kaynak önceki DeepSeek çalışması ile Mira'nın onaylı `06fb43db` barkod yayını ve `efee8e10` kayıtlarını birleştirir. İlk dalganın runtime hash karşılaştırmalarında onaylı barkod bileşeni, CSS ve PanelLayoutClient eşleşmiştir.

Yerel Toshi'nin güncel katalog DTO'su ve v2 ürün uçlarıyla uyumluluğu için ikinci yayın dalgasının kaynağı **`d02c41604cd26cec4d8cd93cbdabe76029c8822c`** iki ortak panel uygulamasında yayınlandı. Katalog özetinin ek alanı, liste metadata'sı ve dinamik fiyatlı ürünlerin v2 uçları yerel istemciyle uyumlu hale getirildi. Aşağıdaki 919d doğrulama sonuçları ilk dalgaya, son kaynak ve canlı kabul sonuçları ayrı bölümlere aittir.

Mevcut Toshi yalnız yerel intent komutlarını çalıştırıyordu. Yeni aynı-origin API gerçek OpenAI Responses, Gemini generateContent, Claude Messages ve DeepSeek Chat Completions çağrılarını yapar. Doğal dil, devam soruları, mağaza/kullanıcı kapsamlı kayıtlı geçmiş, sabit sağlayıcı/model, yeni konuşma, durdurma, aynı-operation belirsiz yanıt kurtarma ve sunucu kaynakları eklenir. Model katalog/stok/sipariş/müşteri/indirim/satış özetini yetkili okuma araçlarından alır; panel kullanımı bakım yapılan yardım kayıtlarından gelir. Kart/adres/e-posta/telefon ve gizli altyapı alanları araç DTO'larına dahil edilmez.

Sağlayıcı anahtarı, model isteği için mevcut şifreli sunucu akışında kısa süreyle açılır; geçici anahtar buffer'ları işlem sonunda temizlenir. QA için mağaza anahtarı düz metin olarak görüntülenmedi veya loglanmadı; anahtar public konuşma, kaynak ya da hata DTO'suna eklenmez. Tanınabilir yapıştırılmış credential sohbet rezervasyonu ve model isteğinden önce reddedilir. Bağlantı hatasında gizli sağlayıcı/yerel fallback ve otomatik ücretli retry yoktur. Ürün/sipariş/ödeme değişikliklerini model yürütmez; ilgili panel ekranına yönlendirir.

[Resmî doküman araştırması ve kararlar](toshi-ai-research-2026-09-26.md), [tasarım](../superpowers/specs/2026-09-26-toshi-real-ai-assistant-design.md), [gerçek PostgreSQL kanıtları](toshi-real-ai-assistant-validation-2026-09-26.md).

## İlk kaynak için doğrulama

- `919d4c72` birleşik kaynağında server/tools/HTTP **24/24**, generation/React UI/onaylı barkod **100/100 PASS**.
- Contracts/repository/migration **37/37**, contracts/data/panel tür kontrolleri **PASS**.
- Ortak `customer-panel` ve `storefront-shared` üretim derlemeleri **PASS**; mevcut ödeme onay kapsamları resmî generator ile bu kaynağa bağlandı. [Kaynak ve hedef sonuçları](evidence/toshi-real-ai-assistant/verification.json), [ilk dalganın ödeme kaynak bağı](evidence/toshi-real-ai-assistant/wave1-binding.json).
- Gerçek Toshi bileşeninin yerel Next tarayıcı fixture'ında 1440/1024/390 px yatay taşma **0**, yazma alanı görünür. Kota, geçmiş/reload, drawer iptal/aynı işlemle kurtarma ve Escape odağının Bana Sorun'a dönüşü doğrulandı. API cevapları sentetiktir; bu kontrol canlı sağlayıcı inference kabulü veya ücretli model çağrısı değildir. [Arayüz kontrolünün kapsamı](evidence/toshi-real-ai-assistant/ui-qa.json).
- Bağımsız incelemelerin bulduğu isteğe bağlı ürün DTO'su, version 0, kesin/belirsiz hata ayrımı, azami Unicode snapshot, Gemini 429 ve completion sırasında iptal sorunları regression testleriyle düzeltildi.

## Son kaynak için hedef doğrulama

`d02c41604cd26cec4d8cd93cbdabe76029c8822c` için ortak panel üretim derlemesi ve tür kontrolü **PASS**. Son server/tools/HTTP hedefleri **24/24**, generation/UI/yerel istemci hedefleri **46/46 PASS**. Yerel katalog DTO uyumluluğu için bağımsız inceleme **PASS**; gerçek eski DTO uyuşmazlığını gösteren RED koşusunun ardından hedef testler **15/15 GREEN** verdi. Bu sonuçlar son kaynağın genel panel paketinin tamamen yeşil olduğu anlamına gelmez.

[Son hedef test sonuçları](evidence/toshi-real-ai-assistant/verification.json), [son panel derlemesi](evidence/toshi-real-ai-assistant/final-build-result.json) ve [yerel DTO RED/GREEN kanıtı](evidence/toshi-real-ai-assistant/local-catalog-dto.json) kaydedildi. Son kaynağın ödeme bağı [binding.json](evidence/toshi-real-ai-assistant/binding.json) ile, ilk dalga ise ayrı `wave1-binding.json` ile izlenir. Ortak storefront kaynağı ikinci dalgada değişmedi; onun üretim derlemesi 919d kaynağında PASS'tır.

### Genel panel testlerinin açık durumu

**Genel test paketi yeşil değildir.** Son tam koşu final barkod merge'i ve son cancellation regression öncesinde **1659 test: 1650 pass / 8 fail / 1 skip** verdi. Normal faz exit 1, react-server fazı exit 0'dır. Toshi'ye ait yeni CSS source assertion doğru viewport beklentisine güncellendi; hedefli **1/1** ve Toshi shell **7/7** geçti. Bu düzeltmelerden sonra tam paket yeniden çalıştırılmadı.

Önceden raporlanan yedi başarısızlığın **altısı baseline üzerinde kanıtlanmış eski kaynak assertion'larıdır**. Diğeri signed-out Next runtime timeout'udur: mevcut tam koşuda tekrar görülmüştür, baseline üzerinde **NOT_RUN** olduğundan eski hata olarak kesinleştirilemez; ortam/yük kaynaklı timeout değerlendirmesi **inconclusive** kalır. Son adayın hedef testleri veya derleme sonucu bu genel paket durumunu otomatik olarak değiştirmez. [Tam sonuç, zamanlama ve baseline ayrımı](evidence/toshi-real-ai-assistant/full-panel-tests.json).

## SQL164

Yalnız `202609260164_toshi_conversations.up.sql` uygulandı; SHA256 `da6c070a18ae39c618003038be0bac7f42c5d2c9b24e3826a981f0e1331db801`. `2026-09-26 18:14:04 UTC` tek REPEATABLE READ transaction commit'i öncesinde/sonrasında 234 mevcut tablonun tüm satır digestleri ve sahiplik/ACL/RLS ile 1234 önceki fonksiyonun gövdeleri/sahiplik/ACL birebir korundu. Dört özel FORCE RLS tablo ve 10 fonksiyon eklendi; app doğrudan tablo erişimi yoktur. SQL160/161/162/163 tekrar uygulanmadı/değiştirilmedi. [Commit kanıtı](evidence/toshi-real-ai-assistant/live-migration.json), [son ACL/RLS](evidence/toshi-real-ai-assistant/live-dbcheck.json).

Kalıcı, `0600` izinli canlı yedek `/data/celebix-release-backups/toshi_ai_20260926_live.dump`, SHA256 `7728b8f8c048f2f0e5461f8df6dcde60df304053a2ac6b2523e59b6bec8355fc`. SQL sonrası 18:18 UTC kontrolünde dört admin adresi HTTP 200, `health=ok`, Redis `ready`; iki storefront adresi HTTP 200 verdi. Bu sonuç uygulama yayını sonrası son sağlık kontrolü yerine geçmez. [SQL sonrası sağlık](evidence/toshi-real-ai-assistant/post-sql-health.json).

SQL164 down, konuşma/mesaj/operation/event tablolarından herhangi birinde kayıt varken veri silmeden durur. Uygulama geri dönüşü ek şemayı ve oluşmuş konuşma geçmişini korumalıdır; kayıtları silmek veya canlı yedeği geri yüklemek uygulama geri dönüşünün rutin adımı değildir. Önceden onaylı uygulama kaynağına dönülürken source pin ve `SOURCE_COMMIT` birlikte bağlanmalı, mevcut ödeme onay kapsamı korunarak resmî generator'ın o kaynak için ürettiği digestler kullanılmalıdır. Bu ikinci dalga katalog istemcisi düzeltmesi için SQL164 yeniden uygulanmaz.

## Yayın durumu

İlk dalga `919d4c72` kaynağıyla NET ve SITE ortak panel uygulamalarında **finished** durumuna ulaştı. NET için 18:26 UTC, SITE için 18:36 UTC itibarıyla image etiketi, `SOURCE_COMMIT`, listelenen kaynak hashleri, iki generated payment metadata hash'i ve gerekli derlenmiş Toshi/barkod/sipariş/POS/ürün/AI ayar çıktıları **PASS** verdi. [İlk NET runtime](evidence/toshi-real-ai-assistant/wave1-runtime-net.json), [ilk SITE runtime](evidence/toshi-real-ai-assistant/wave1-runtime-site.json).

Son `d02c4160` dalgası NET'te **18:46:48 UTC**, SITE'ta **18:53:17 UTC** itibarıyla **finished** oldu. Her iki uygulamanın runtime kontrolünde kaynak/image/SOURCE_COMMIT, **46 kaynak dosyası**, **2 generated ödeme metadata dosyası** ve **9 derlenmiş route/sayfa** eşleşti; sonuç **PASS**. Son durumda aktif global deployment kuyruğu **0**. [NET deployment](evidence/toshi-real-ai-assistant/wave2-deployment-net.json), [SITE deployment](evidence/toshi-real-ai-assistant/wave2-deployment-site.json), [son NET runtime](evidence/toshi-real-ai-assistant/runtime-net.json), [son SITE runtime](evidence/toshi-real-ai-assistant/runtime-site.json).

### Yayın yapılandırmasının korunması

İki uygulamada yalnız kaynak dalı/sabit commit, mevcut `SOURCE_COMMIT` ve aynı kaynağa bağlı mevcut iki PayTR TEST/LIVE evidence digest değeri güncellendi. Saklanan ham yapılandırma kayıtları karşılaştırılarak diğer alanlar, ortam satırları/kimlikleri, sağlayıcı bilgileri, modlar, runtime/buildtime/preview bayrakları ve deployment hook'ları korundu. NET'in production PayTR bayrakları kapalı, SITE'ın mevcut production onay kapsamı açık kaldı; Iyzico için yeni production yetkisi eklenmedi. Auto Deploy ve Preview Deployments iki uygulamada da kapalıdır. [NET koruma kontrolü](evidence/toshi-real-ai-assistant/wave2-prepare-net.json), [SITE koruma kontrolü](evidence/toshi-real-ai-assistant/wave2-prepare-site.json), [son kaynak/scope/hook kayıtları](evidence/toshi-real-ai-assistant/final-config.json).

İlk dalga hazırlığında önkontrol, preview Iyzico satırlarını production scope gibi değerlendiren beklenti nedeniyle yazım yapılmadan durdu. Yapılandırma tekrar okunup preview satırları ile kapalı production kapsamı ayrıldı; düzeltilen koruma kontrolü tüm mevcut satırların ve bayrakların korunmasını doğruladıktan sonra yayın hazırlığı sürdürüldü. Mod veya kimlik bilgisi değişikliği yapılmadı.

### İlk dalgada gerçek DeepSeek kontrolü

`admin.guzidekuyumcu.com.tr` üzerinde gerçek, yetkili native Chrome arayüzünde mağazanın mevcut `DeepSeek / deepseek-flash` bağlantısı iki soruya cevap verdi: “Ürüne 14,89 gram bilgisini nasıl eklerim?” ve “Bu bilgi zorunlu mu?”. İlk cevap ağırlık alanına `14,89` girilip `g` seçilmesini anlattı; devam cevabı fiziksel bilgilerin isteğe bağlı olduğunu, ağırlığın stok adedi veya fiyat olmadığını açıkladı. Panel kaynağı görünür, devam sorusu bağlamı korunmuştur. İlk dalgada sayfa yenilemesinden sonra kayıtlı geçmiş de doğrulandı.

Bu iki gerçek model cevabı **919d ilk dalgasına aittir**; doğrudan sağlayıcıya ayrı test çağrısı yapılmadan mevcut yetkili panel akışı kullanıldı ve düz metin anahtar okunmadı. Son d02 kaynağı SITE'ta doğrulandıktan sonra yeni yetkili native Chrome sekmesinde kayıtlı gram konuşması yeniden açıldı: iki soru, iki yanıt ve panel kaynakları görünür kaldı. Bu son geçmiş kontrolü **ek ücretli model çağrısı olmadan PASS** verdi. Diğer üç sağlayıcı için canlı mağaza çağrısı yapılmadı; protokolleri adapter fixture testleriyle doğrulandı. [Gerçek sohbet, son geçmiş ve yerel mod kanıtı](evidence/toshi-real-ai-assistant/live-browser.json).

### Son kaynakta yerel mod ve erişim

Siora'da son d02 sürümünün yetkili gerçek arayüzünde “Yerel mod” görüldü. Mağaza özeti **10 ürün / 0 bekleyen sipariş / 0 aktif müşteri / 1 terk edilmiş sepet** ve görünür kaynakla döndü. Mevcut `SRA-2024-HAKI` SKU'su için salt okunur arama **1 doğru ürün** buldu: “Lunea Noir Asimetrik Düğmeli Vintage Jean”; ürün kaynağı görünürdü. Bu kontrolde ürün değiştirilmedi. Son Güzide geçmişi ve Siora yerel modu [aynı bounded tarayıcı kanıtında](evidence/toshi-real-ai-assistant/live-browser.json) kayıtlıdır.

Yayın sonrası dört admin adresinde HTTP **200**, `health=ok`, Redis `ready`; iki storefront adresinde HTTP **200** doğrulandı. Oturumsuz erişim kontrollerinin **24/24**'ü PASS: korumalı sayfalar `/login` adresine yönlendi, konuşma API'ları **401** döndü. [Son sağlık](evidence/toshi-real-ai-assistant/final-health.json), [erişim korumaları](evidence/toshi-real-ai-assistant/final-access-guards.json).

| Son kabul alanı | Durum |
| --- | --- |
| Yerel katalog uyumluluk düzeltmesini içeren son kaynak SHA | `d02c41604cd26cec4d8cd93cbdabe76029c8822c` — iki panelde doğrulandı |
| Son adayın hedef testleri, tür kontrolü ve panel üretim derlemesi | **PASS** — server 24/24, generation/UI/local 46/46; DTO 15/15 |
| NET ikinci yayın kimliği ve finished sonucu | `e886af8c-b10f-4b66-b01d-3c500c0002a7` — **finished** |
| SITE ikinci yayın kimliği ve finished sonucu | `43a4dfce-5775-4167-a96a-43894efe749f` — **finished** |
| Son runtime kaynak/dosya/metadata/compiled karşılaştırmaları | **PASS** — her uygulamada 46 kaynak + 2 metadata + 9 compiled çıktı |
| Son yayın sonrası admin/storefront sağlık kontrolü | **PASS** — 4 admin ve 2 storefront; temizlik sonrası tekrarlandı |
| Gerçek yetkili UI: yerel katalog özeti ve ürün araması | **PASS** — Siora, son d02 kaynakta doğru özet ve mevcut SKU için 1 doğru eşleşme |
| Gerçek bağlı DeepSeek: yanıt, araç verisi, devam sorusu ve kayıtlı geçmiş | **PASS** — 919d'de 2 gerçek cevap/panel_help kaynağı; d02'de kayıtlı geçmiş, ek model çağrısı 0 |

Gerçek sağlayıcı kontrolünün kapsamı DeepSeek'in panel yardım aracı ve devam sorusudur; canlı katalog/sipariş/ciro araçlarının her biri veya diğer üç sağlayıcı için ücretli kabul yapılmış sayılmaz. Katalog ve diğer araç sınırları hedefli fixture testleriyle, gerçek Siora katalog akışı yerel modda doğrulandı. Genel panel paketinin yukarıdaki açık test durumu korunur.

## Son temizlik

Tam adı doğrulanan geçici QA veritabanı `celebix_toshi_ai_qa_20260926`, bu çalışmaya ait bridge/bağlantı dosyaları ve bilinen geçici yayın yardımcıları kaldırıldı. **6 yedek root sahibi ve 0600 izinle tutuldu; SHA256 değerleri yeniden doğrulandı.** Canlı DB, QA dump ve iki uygulamanın iki dalga yapılandırma yedekleri ile onları tanımlayan kayıtlar korunmuştur. Son temizlik kanıtında **9.581.203.456 byte** kullanılabilir alan kaydedildi; image, volume veya cache prune yapılmadı. [İlk kontrollü QA temizliği](evidence/toshi-real-ai-assistant/cleanup.json), [son yardımcı/yedek/alan kontrolü](evidence/toshi-real-ai-assistant/final-cleanup.json).

Temizlik sonrası **18:57 UTC** sağlık kontrolü yeniden PASS verdi: dört admin HTTP 200 / `ok` / Redis `ready`, iki storefront HTTP 200. Son native kontrol kaydı **18:58 UTC** itibarıyla gram konuşmasının d02'de görünür olduğunu doğrular. Yalnız root'un son açtığı QA sekmesi kapatıldı; kullanıcı tarafından yeniden kullanılan sekmeler ile ürün/tasarım çalışmaları korundu. [Temizlik sonrası sağlık](evidence/toshi-real-ai-assistant/post-cleanup-health.json), [son arayüz/sekme kapsamı](evidence/toshi-real-ai-assistant/live-browser.json).
