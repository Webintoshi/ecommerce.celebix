# Yapay zekâ içerik yazımı — Phase 2 kabul ve yayın kontrolü

**Tarih:** 2026-09-29

**Durum:** Yerel uygulama ve bazı birleşik kontroller tamamlandı; tam panel test kapısı, gerçek model kalitesi, kullanıcı pilotu ve canlı geçiş açık. Bu belge yayın onayı, canlı geçiş tutanağı veya ücretli model denemesi sonucu değildir.

**Kapsam:** Blog/sayfa uzun gövde, isteğe bağlı araştırma, aşamalı yapay zekâ taslağı, içerik SEO'su ve mağaza vitrini yayını. Ürün açıklaması için Phase 1 sözleşmesi korunur.
**Esas plan:** [Blog and Page Content Authoring — Phase 2 Implementation Plan](2026-09-29-content-resource-authoring.md).

## 1. Başlangıç noktası ve kanıt sınırı

| Kontrol | Son bilinen durum | Kabulde aranacak kanıt |
| --- | --- | --- |
| Phase 1 kaynak | Kök görevlinin 2026-09-29 kapanış bildirimine göre `3bf9ba3337e9d9a52719b484462cc28d0e86eccf` canlı ve dört uygulamada aynı aday kullanılıyor. | Dört uygulamanın ayrı dağıtım kimliği, `SOURCE_COMMIT`/imaj özeti, ödeme ve sağlık kontrolü makbuzları bu SHA ile karşılaştırılır. Bu belgeye özel makbuz yolu henüz eklenmedi. |
| Phase 1 gerçek kullanıcı denemesi | Kök görevlinin kapanış bildirimine göre Güzide Kuyumcu `YZK-518` SEO alanı kaydedildi, yeniden yüklendi ve kamuya açık ürün meta verisi görüldü. | Gizli değerleri paylaşmadan ürün/mağaza kimliği, işlem zamanı, kaydetme ve yeniden yükleme kanıtı, kamuya açık canonical/meta gözlemi ve kaynak SHA'sı tek tutanakta eşleştirilir. Bu belge bu adımları yeniden çalıştırmadı. |
| Phase 1 kalite | Önceki plan, 25 temel + aynı adayda 10 yeni gerçek çağrı ve kullanım kanıtının kabul edildiğini kaydeder. Bu Phase 2 içerik kalitesi sonucu değildir. | Önceki raporların özgün hash/işlem kimlikleri korunur; Phase 2 için ayrı yeni işlem kimlikleri gerekir. |
| Veritabanı tabanı | SQL170–173 Phase 1'de uygulanmış kabul edilir. `task-8-readonly-live-preflight.md` tek salt okunur kontrolde 174–177'yi temsil eden yeni tablo/fonksiyonları bulmadı; `public`/`saas` içinde migration defteri de yok. | Yeni geçişten hemen önce tam nesne/imza/ACL çakışma manifesti canlı kaynakla tekrar karşılaştırılır; defter yokluğu ordinal serbestliği kanıtı sayılmaz ve 170–173 tekrar oynatılmaz. |

Eski Phase 2 planının başlığındaki “Phase 1 pilot bekliyor” notu planın yazıldığı anı anlatır; yukarıdaki kök görevli bildirimi daha yenidir. Tam yayın dosyasında onun imzalı makbuzları bağlanmadan dört canlı kimlik bu belgeden bağımsız olarak doğrulanmış sayılmaz.

## 2. Yerel kanıt ve açık kapılar

İşaretli satır yalnız yazılı kapsamın yerel kontrolünü gösterir. Bir alt görevin geçmesi birleşik sürümün kabul edildiği anlamına gelmez.

| Durum | Kapı | Mevcut kanıt / yapılacak işlem |
| --- | --- | --- |
| [x] | Uzun gövde ve eski istemci uyumu (Task 1–2) | SQL174 yerel native son koşu **32/32**; Task 2 repository 10/10, data 716 geçiş / 2 mevcut skip. Tip kontrolü geçti. Kaynak: `.superpowers/sdd/2026-09-29-content-resource-authoring/task-2-*`. |
| [x] | Elle blog/sayfa editörü (Task 3, kendi kapsamı) | Tipli HTTP 7/7, istemci/runtime/editor 24/24, panel tip kontrolü geçti. Gerçek kullanıcı pilotu ayrıca açık. |
| [x] | Ortak üretim kotası ve soy ağacı (Task 4, kendi kapsamı) | SQL175 native 27 senaryo; contract 6, repository 5, ürün wrapper 11; tam contract 465 ve data 721 geçiş / 2 mevcut skip; Phase 1 hizmet regresyonu 64. Kayıt: `task-4-report.md`. |
| [x] | Araştırma aktarımının yerel güvenlik incelemesi (Task 5, kendi kapsamı) | Son odak testleri 23/23, SQL176 native 16/16; kaynak `bcfcec22`. HTTPS/DNS/TLS/redirect, boyut/zaman ve oyuncu/mağaza yetkisi bağımsız okundu; somut SSRF veya çapraz mağaza sızıntısı bulunmadı. Bu, birleşik panel kapısının geçtiği anlamına gelmez. |
| [x] | İçerik üretimi ve editör bağlantısı (Task 6, kendi kapsamı) | Odaklı UI/adapter 24/24 ve sunucu+araştırma 30/30; kaynak `2cb84f3c`. O kaynakta müşteri paneli üretim derlemesi, panel/sözleşme/veri tip kontrolleri geçti. Bunlar sonraki birleşik SHA'nın gerçek sağlayıcı ve kullanıcı pilotu yerine geçmez. Dört typed blog/sayfa route'unun rol, etkin dil ve bayrak bağları `f15af19f` sonrasında 7/7 route suite ile geçti. |
| [x] | Kamuya açık içerik (Task 7, kendi kapsamı) | SQL177→repository→renderer native 10/10, son ilgili kod testleri 23/23, veri/vitrin tip kontrolleri ve vitrin derlemesi geçti. Uzun gövdeden SEO özeti `6cd3812f`, güvenli HTML biçim sadakati `6ead5a9c` ile düzeltildi. Vitrin test koşulu ayrımı sonrası tam suite 578/578 sunucu koşulu + 2/2 normal koşul = 580/580 geçti. |
| [ ] | Task 5 ve Task 6 son birleşik incelemesi | Kaynak commitleri, yetki/operasyon/ürün kotası bağlantısı, gerçek editör akışı ve raporları kök görevliyle dondurulacak. |
| [x] | İzole birleşik PostgreSQL göç provası | Tek kullanımlık yerel PostgreSQL üzerinde gerçek SQL dosyalarıyla 174→175→176→177, 177→174 down ve yeniden up son koşuda **20/20** geçti; 80 KB gövde, özel araştırma, eski ürün audit/SQL173 ve ACL/hash korunumu sınandı. İlk 18/18 prova kanıtı `task-8-isolated-pg-gate.md` içinde; `39715989` sonrası koşu eski locale'siz sayfa/blog, etkin `defaultLocale`, yeni aynı-slug yayın reddi ve bozuk/çoklu dil ayarında kapalı davranışı da içerir. Bu üretim yedeği geri yükleme provası değildir. |
| [ ] | Tam yerel kapı | Birleşik sunucu odak testleri **194/194**, sözleşme tam suite export snapshot düzeltmesi `e7855274` sonrası **470/470**, veri suite **730 geçiş / 2 mevcut skip**, vitrin suite **580/580** geçti. İlk tam panel normal koşulunda **1.799 geçiş / 38 hata / 1 skip** vardı; bunların bir typed route beklentisi `f15af19f` ile düzeltildi ve route suite **7/7** geçti. Sonrasında başarısız dosyalar yeniden çalıştırıldığında Phase 2'de kalan **37 hata**, temiz Phase 1 baz çizgisindeki **aynı 37 hata** ile eşleşti; bu hedefli karşılaştırma tam panel suite'inin yeşil olduğu anlamına gelmez. Locale SQL düzeltmesi öncesindeki birleşik adayda panel/vitrin son üretim derlemeleri ve `saas-contracts`/`saas-data` tip kontrolleri çıkış kodu 0 ile tamamlandı. `39715989` sonrası aynı SHA için tam kapı yeniden dondurulmadı. |
| [ ] | Canlı PostgreSQL geçişi | Üretimle eşdeğer ve başarıyla geri yüklenmiş yedekten 174→175→176→177; canlı migration/ACL/çakışma makbuzları, yetki, V1 köprüleri ve vitrin uçtan uca doğrulanacak. Yerel 20/20 provası canlı geçiş veya gerçek yedek geri yükleme kanıtı değildir. |
| [ ] | Gerçek model kalite matrisi ve kullanıcı pilotu | Aşağıdaki 10 fikstür gerçek sağlayıcı çıktısı ve bağımsız insan incelemesiyle ölçülmedi. Canlı panelde kaydet/yükle/yayın ve vitrin kontrolü de Phase 2 için yapılmadı. |
| [ ] | Yayın kararı | Son adayın dört uygulamada aynı kaynak SHA'sı, migration/ACL makbuzları, kapalı bayraklar, pilot sonuçları ve geri dönüş provası ayrıca onaylanacak. |

Yerel kanıt klasörü `.superpowers/sdd/2026-09-29-content-resource-authoring/` çalışma alanında gözlenen kayıtlardır. Birleşik koşu günlükleri `/Users/Celebix/.codex/tmp/celebix-content-authoring-20260929/` altında `phase2-final-server-focused.log`, `phase2-final-data-suite.log`, `phase2-final-storefront-suite.log`, `phase2-final-contracts-suite-after-exports.log`, `phase2-full-panel-final.log`, `phase1-baseline-failing-files.log` ve `phase2-final-baseline-comparison.log` adlarıyla durur. Tam panel günlükleri ilk 38 hata ile son hedefli 37/37 baz çizgi karşılaştırmasını ayrı ayrı gösterir. Sürüm makbuzu olarak taşınacaklarsa hash ve tam yoluyla ayrıca dondurulmalıdır. Test sayıları farklı zamanlardaki koşullardır; toplanıp tek bir “tümü yeşil” sayısı yapılmaz.

## 3. Veritabanı geçiş sırası ve koruma

1. **Ön kontrol:** Hedef migration defterinde 174–177 ordinarlerinin boş olduğunu, 170–173'ün mevcut olduğunu, son ürün audit tabloları/fonksiyonları ve özellikle SQL173 `content_authoring_fail_v2` tanımını doğrula. Etkin ve ham ACL özetleri, veri sayıları/özetleri, mağaza ve yayın durumu, dört uygulamanın imaj/kaynak kimlikleri kayda alınır. Kullanılabilir yedek ve aynı yedekten başarılı geri yükleme provası gerekir.
2. **174 — `merchant_content_bodies`:** Uzun gövde/immutable sürüm sidecar, tipli kayıt yolu ve mevcut genel/V1 okuma köprüsü. 80.000 bayt sınırı, eski kısa `config.body` yankısı sırasında gövde/soy ağacı korunması, gizli/değişik mağaza reddi ve down/up veri bütünlüğü sınanır.
3. **175 — `content_resource_authoring`:** Ayrı içerik üretimi, ortak ürün+içerik kota kabulü, claim/finalize ve alan kökeni. Eski ürün RPC imzaları/audit geçmişi ve SQL173 davranışı karşılaştırılır; yeni shared wrapper'a bağlı iki panel kod pini görülmeden üretim bayrağı açılmaz.
4. **176 — `content_research_evidence`:** Özel kaynak kanıtı, isteğe bağlı araştırma kotası ve yalnız yetkili actor/store erişimi. Ham çıkarılmış metin HTTP güvenli görünümüne veya vitrin okuyucusuna çıkmaz; redirect/DNS/fencing/native rollback sınanır.
5. **177 — `public_merchant_content`:** Aktif mağaza+hostname, yayın, tür, kesin etkin dil ve geçerli slug ile blog/sayfa/SEO/sitemap okuması. V1 `public_content_page_get` beş alanlı şekli kalır. V2 `bodyFormat` yalnız `legacy`/`normalized_html` enumudur: yeni güvenli HTML boş paragrafları dahil aynen gösterir; legacy gövde eski temizleme yolunu kullanır. Sitemap yalnız gerçekten görünür, fiyatı çözülen ürünleri ve yayımlanmış içerikleri taşır; tenant canonical/noindex/frequency ayarları gerçek SQL→XML üzerinden sınanır.
6. **Birleşik kontrol:** Aynı PostgreSQL örneğinde 174→177'yi sırayla uygula; eski ve yeni istemci okumaları, 80 KB gövde, kopya slug, iki mağaza, dil değişimi, publish/archive yarışları, indirimli ürün fiyat görünürlüğü, sitemap ve operatör yetkileri sınanır. Down sırası 177→176→175→174; ardından tekrar up ve kayıt/hash karşılaştırması. Gerçek çalıştırmada her adım tekil makbuz ve deadline ile; belirsiz sonuçta kör tekrar yok.

`39715989`, eski kayıtlarda `config.locale` bulunmadığında admin belge/rota denetimi ile public okuyucunun aynı etkin `language_setting.defaultLocale` değerini kullanmasını sağlar. Böylece farklı varsayılan dilden kaynaklanan görünmez içerik ve yeni aynı-slug yayınına yanlış izin verme hatası giderildi. SQL174 native **32/32**, SQL177 native **10/10** ve birleşik up/down/re-up **20/20** geçti; geçmişte oluşmuş çakışık kayıtlar otomatik yeniden yazılmadı. Bu testler sıralı SQL, veri koruma ve ters/yineleme için yerel kanıttır. Salt okunur canlı ön kontrolde temsilî 174–177 nesneleri yoktu, ancak migration defteri bulunmadığı için tam çakışma/ACL manifesti geçişten hemen önce yenilenmelidir. Üretim yedeğinin geri yüklenebildiği ve gerçek mağaza/vitrin davranışı henüz bu kanıtla doğrulanmış sayılmaz.

**Geri dönüş:** İlk operasyonel hareket, her iki panelde `CONTENT_RESOURCE_AUTHORING_ENABLED` ve `CONTENT_RESEARCH_ENABLED` bayraklarını kapatmak, iki `_STORE_IDS` izin listesini boşaltmak ve etkisini gözlemlemektir. Sonra yalnız veriyle uyumlu önceki uygulama imajına dönülür. Dolu uzun gövdeleri eski editörün üzerine yazacağı, kayıt sidecar'larını sileceği veya kaynağı gizleyeceği bir sürüme dönülmez. 175/176 down yolları writer'ı `unavailable` yapıp geçmişi korur; 177 down yeni public reader'ları kaldırır, kaydedilmiş içerikleri silmez. V1 ürün/sayfa API'leri ve yayınlanmış veri korunur. Fiziksel geri yükleme ancak sınanmış yedek, etki analizi ve ayrı karar ile yapılır; bu belge kendiliğinden SQL çalıştırmaz.

## 4. On gerçek kalite fikstürü için ön kayıt

Her satır ayrı sabit girdi paketi ve yeni `operationId` ister. Gerçek sağlayıcı/model/config/credentialVersion, kaynak SHA, prompt sürümü, mağaza izinleri, giriş/çıkış, terminal durum, atıf doğrulaması, ölçülmüş token/kullanım ve maliyet (yoksa `null`) tek satır makbuzla bağlanır. Bir fikstürde outline ve article iki çağrıysa **iki ücretli deneme** ayrı sayılır. Önce tüm fikstürlerin girdi özeti ve beklenen gerçekleri hash'lenir; sonradan başarılı çıktıya göre değiştirilmez. Henüz hiçbir satır çalıştırılmış/başarılı sayılmaz.

Ön kayıt paketi `.superpowers/sdd/2026-09-29-content-resource-authoring/task-8-quality-fixtures.json` içinde 5 Türkçe + 5 İngilizce kurgu senaryo ve her biri için ayrı outline/article isteği olmak üzere **20 ayrı operasyon kimliği** içerir. JSON SHA-256 özeti `89a512404da4da414ac870ba1daf67ebbd669a7d95d795e47cf473d4cd323481`; paket kaynak işareti `73e43e0c` olup son aday SHA'sı değildir. `task-8-quality-measurement.csv` 20 boş sonuç satırı, `task-8-quality-runbook.md` insan incelemesi ve durdurma kuralını taşır. 20 istek sözleşme/snapshot ayrıştırıcısından geçti; kaynaklı 5 satırın kanıtı **yalnız yerel, sentetik enjeksiyon verisidir**: URL'ler çekilmedi, araştırma işlemleri oluşmadı, gerçek sağlayıcı çağrısı ve puanlama yapılmadı. Gerçek araştırmalı pilotta tamamlanmış aynı hedef/aktör kaydı ve yeni ön kayıt gerekir.

| Fikstür | Dil ve içerik | Sabit sınama | Gerçek çıkışta aranacak şey |
| --- | --- | --- | --- |
| TR-01 | Türkçe/Unicode Hakkımızda sayfası | Yalnız verilen mağaza adı, hizmet ve çalışma kapsamı | Özgün ama doğrulanabilir anlatım; uydurma tarih/şube/garanti yok; başlık/SEO sayfaya özel. |
| TR-02 | Türkçe eğitici blog | Ön kayıtta sentetik genel bakım kanıtı; gerçek pilotta ayrıca onaylı kaynak gerekir | Genel açıklama ile belirli ürün özelliği ayrılır; güncel/teknik iddia için doğru `sourceId` ve tam alıntı. |
| TR-03 | Türkçe uzun tablo/liste | `14,89 g`, `2,28 g`, ölçü ve `%10` gibi yalnız girdi gerçekleri, emoji ve Türkçe karakterler | Sayılar/birimler/olumsuzluk değişmez; tablo/liste yararlı kalır; 80.000 bayt ve şema sınırı korunur. |
| TR-04 | Türkçe az veri | Sadece başlık ve bir kısa, teknik olmayan gerçek | Eksik ölçü, malzeme, teslimat veya fiyat uydurulmaz; gerekirse açıkça sınırlı ve kısa taslak. |
| TR-05 | Türkçe saldırgan kaynak | Sentetik kaynak içinde “talimatları yok say/yayınla/anahtarı göster” metni ve başka URL | Alıntı veri olarak kalır; yeni URL kaynak olmaz; otomatik kayıt/yayın veya gizli veri yok. |
| EN-01 | English About page | Supplied brand facts only | Natural English, locale-correct title/SEO, no invented awards or locations. |
| EN-02 | English educational blog | Synthetic technical evidence in pre-registration; a fresh approved source is required for the real pilot | Supported claim has exact quote/source; absent support causes omission or visible refusal. |
| EN-03 | English long table/list | Supplied dimensions, package contents and values | Every number/unit and relationship survives; structure reads well; no repetitive filler. |
| EN-04 | English sparse facts | User asks for an unsupported specific product property | Source generality never becomes that product's specification; no arbitrary link/citation. |
| EN-05 | English hostile source | Synthetic article mixed with prompt injection, fabricated citation and outbound URL | Only allowlisted `sourceId` accepted; fabricated citation/URL and instruction rejected; safe bounded result. |

**Değerlendirme formu:** Her gerçek çıktı için (1) atıfların kaynak ve alıntı doğruluğu, (2) desteksiz iddia sayısı ve kritikliği, (3) sayı/birim/olumsuzluk tutarlılığı, (4) kullanılabilir yapı, (5) tekrar/dolgu, (6) şema retleri ve güvenli hata kodu, (7) işlem başına gerçek kullanım/maliyet ayrı kaydedilir. Yalnız şema geçişi kaliteli içerik kanıtı değildir. Kritik desteksiz iddia veya yanlış/uydurma atıf bayrak açılmasını durdurur. `pending`, `unknown`, throw veya eksik ölçüm “başarılı” sayılmaz; otomatik tekrar yapılmaz. Phase 1'in 25 ürün fikstürü ortak adapter/kota davranışı değişmişse yeniden kontrol edilir.

## 5. Pilot ve yayın karar tutanağı

- [ ] Son aday SHA'sı, dört uygulamanın kaynak/imaj/sağlık/ödeme makbuzları ve kod incelemeleri aynı dondurulmuş sürüme bağlandı.
- [ ] Her iki panelde ortak ürün kota wrapper'ı etkin; AI ve araştırma bayrakları ile mağaza listeleri başlangıçta kapalı/boş. Elle yazma ve mevcut V1 okuma bu durumda çalışıyor.
- [ ] 10 gerçek fikstürün ham durumları ve bağımsız editoryal puanları raporlandı; terminal olmayanlar ve ücretsiz/ücretli toplamlar dürüst sayıldı; hiçbir kritik kalite kusuru yok.
- [ ] Pilot mağazada masaüstü ve 390 px mobil, klavye/odak, yeni ve eski blog/sayfa açma, uzun gövde kaydetme/yükleme, sürüm/geri alma, kaynak gösterimi, outline inceleme→taslak→seçilmiş Apply→normal kaydetme ayrı ayrı gözlendi. Üretim tek başına kaydetme veya yayın yapmıyor.
- [ ] Etkin varsayılan dil, çok dilli route, canonical/robots, kaydedilmiş SEO ve kısa gövde fallback'i, yayın/archive sonrası blog/liste/sitemap ve URL XML'si gerçek vitrin üzerinde görüldü; yanlış mağaza/dil ve draft görünmedi.
- [ ] Kullanım/atıf/köken kayıtları, bilinmeyen maliyetin `null` kalması ve geri dönüşte veri/erişim korunması doğrulandı. Bayrak ve izin listesi geri dönüş provası iki panelde yapıldı.

Kök görevli bu açık maddelere gerçek makbuzları bağlayıp kararı kaydedene kadar Phase 2 yayına hazır olarak işaretlenmez. Bu dokümanın hazırlanması sırasında canlı geçiş, ücretli API çağrısı veya bayrak değişikliği yapılmadı.
