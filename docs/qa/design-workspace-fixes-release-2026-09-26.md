# Tasarım çalışma alanı — düzeltmeler ve yayın doğrulaması

Kapsam: kullanıcı tarafından onaylanan `/settings/design` incelemesindeki D01–D13 ve ikinci aşama maddeleri. Ortak müşteri paneli ve ortak storefront; NET/SITE mağazaları. Uygulama çalışma alanı `codex/design-workspace-fixes`, taban `0adfd8b2`; mevcut panel `d02c4160` ve storefront `8a2281c7` değişiklikleri korunur. Son tasarım kaynağı `ff56325482b942dbc2168680836cde9143e5b31b`, onaylanan Mira ayarları ve son mobil CSS düzeltmesiyle birleştirilmiştir. Ortak yayın için incelenmiş son kaynak `89cc73218f2a7113f2fd593ca743e45e51621a98`.

## Uygulanan kapsam

| Bulgu | Düzeltme | Kabul kanıtı |
|---|---|---|
| D01 | Elle ürün seçimi; ad/SKU/barkod araması, kategori filtresi, seçilen sıra, kaldırma ve 12 ürün sınırı. Stokta olmayan seçimin yerine başka ürün eklenmez. | Kontrat, SQL gerçek yetkili kaydet/yayınla, editör davranış testleri ve tarayıcı |
| D02 | Kategori bölümü başlık/düzen/seçim/sırası yayınlanan kompozisyondan; mevcut mağazaların görünür eski vitrini geçişte korunur. | SQL164 kopyasında 10/10 görünür kategori içeriği korunması |
| D03 | Kategori kimlikleri, görsel eşlemeleri, bulunmayan eşleme ile açık boş liste, manuel ürün sırası önizleme bağımlılığına dahil. | Gerçek önizleme hook yenileme regresyonu |
| D04 | Doğru storefront asset kaynağından kategori görseli bağlama; eksik seçim için yayın hatası; tenant referansları. | Kontrat/SQL/loader ve tarayıcı kategori görseli seçimi |
| D05 | Gerçek katalog ürünü, seçenek/galeri/bilgi/yorum/benzer ürün, temsili yan sepet; mobil resim/düzen ve menü önizlemesi. | Sunum/model/loader/HTTP testleri, mobil karşılaştırma; son menü/başlık tıklama ve mobil sınır doğrulaması başarılı |
| D06 | Duyuru içeriği kompozisyon otoritesinden; basit/gelişmiş editör senkronizasyonu, eski uzun mesaj görünümünü koruma. | Duyuru testleri ve 10/10 canlı kopya görünür mesaj korunması |
| D07 | Kapalı banner için görsel zorunluluğu kaldırıldı; eski etkin banner doğru gösterilir, açık kapatma tüm banner kaynaklarını kapatır. | Kontrat, gerçek editör, eski yayın örnekleri |
| D08 | Geri al yalnız silinen bölümü geri getirir; sonraki düzenlemeleri korur, sınır çakışmasında veri değişmez. | Komut modeli regresyonları |
| D09 | Kampanya kartı değiştirirken küçük başlık/açıklama korunur; ikinci kart önce düzenlenebilir. | Gerçek editör davranış testleri |
| D10 | Geçici geçersiz alanlar kaydedilmez; yararlı alan hataları ve kategori/ürün/bölüm sınırları; eski açık editör yeni kaydı ezmez. | Editör, yeniden bazlama ve sınır regresyonları |
| D11 | Kampanya tarih/saat okuma ve yazması mağaza saat diliminde; geçersiz saat/DST için hata. | Saat dilimi roundtrip ve DST testleri |
| D12 | Kategori hedefi gerçek `/categories` rotasıyla uyumlu; yayınlı özel `/pages/[slug]` içeriği güvenli render, mevcut politika yönlendirmeleri. | Kontrat/data/SQL ve içerik sayfası testleri |
| D13 | Stok ve indirim filtresi limitten önce; eski indirimli ürünler de bulunur; kategori sırası korunur. | Katalog/SQL/preview regresyonları |

Ek düzeltmeler: bölüm boşluk ayarı canlıda uygulanır; kayıt durumu taslak ile yayın ayrımını gösterir; yayınla karşılaştırma ve yayındaki tasarımı taslağa geri alma; gerçek onaylı yorumlar; değer önerisi ekleme/silme; yedi inline düzenleme adımı, iç bölüm editörünün Escape sahipliği ve odak dönüşü; yayın sonrası tasarım verisi eski ortak önbellekten okunmaz.

## Son inceleme ile eklenen korumalar

- SQL165 geçiş/geri alma kanıtları alınmadan `storefront_designs` üzerinde `EXCLUSIVE` kilit alınır. Kaydetme çağrıları tamamlanınca devam eder. Daha zayıf kilit gerçek deadlock üretti; son geçişte eşzamanlı kaydetme, eski sürüm çakışması ve değişmiş veri için geri alma reddi 28/28 geçti.
- Yeni seçimleri kabul eden validator yalnız tasarım dokümanlarına uygulanır. Eski merchant composition yazıcısı yeni alanları reddeder; tenant denetimi atlanmaz.
- İçerik sayfasında isteğe bağlı gövde boş metne normalize edilir.
- Editörde geçici alan değişiklikleri güncel bölümün üzerine yalnız değişen alanlar olarak uygulanır; dışarıdan gizleme/geri yükleme en son kaydı ezmez.

## Doğrulama

- Kontratlar: 381/381; SQL artifact/data odaklı kontroller: 24/24; geçiş/concurrency: 28/28.
- Root son editör/workspace modeli/davranış kontrolü: 59/59; son preview/model/loader/renderer grubu: 68/68; gerçek featured-pair composer: 5/5; başlık tıklama renderer: 11/11; mobil paylaşılan bölüm sunumu: 2/2. Panel/storefront/UI paketi typecheck başarılı.
- Son birleşik kaynak `89cc73218f2a7113f2fd593ca743e45e51621a98` üzerinde customer-panel üretim derlemesi exit0: derleme 30.5 saniye, TypeScript 33.1 saniye, 90/90 sayfa ve build tracing tamamlandı. Ortak storefront üretim derlemesi `ff563254` altında exit0; storefront ve packages Git ağaçları son birleşik kaynakla birebir aynı. Owner bağımlılık derlemesi başarılı; owner kaynağı bu birleşimde değişmedi. Durdurulan ara panel derlemesi ve önceki ENOSPC denemesi başarılı gate sayılmadı.
- Gerçek SQL164 canlı veri kopyası: final165 ve assertions başarılı; mevcut yetkiyle taslak kaydetme, yayınlama ve manuel ürün sırası başarılı, prova rollback ile bitti. 10 mağazanın sürümleri, taslakları, görünür duyuruları ve kategori içeriği korundu. [Kopya kanıtı](evidence/design-final/database-exact164-rehearsal.json).
- Son birleşik kaynak incelemesi: bağımsız incelemede P1/P2 yok; tasarım/workspace/editör davranışları 41/41. Mira tasarım/component/lifecycle grubu 67/67, resource/model/loader/hook/client ve react-server handler grubu 42/42, mounted Settings/provider/shipping ve fixture grubu 13/13 başarılı. Assets/destinations yenileme, yerel previewProductId, publishedDraft karşılaştırma/geri alma, çakışma/yayın kilitleri, geçici alanlar ve kategori/görsel çiftli menü seçimi korundu.
- Gerçek SQL165 QA kopyasındaki 10/10 workspace, public design ve public presentation payload’ı son kaynağın parser’larında başarılı. 10/10 workspace yeni assets ve tam publishedDraft alanını içeriyor; bu kanıt salt okunur QA transaction’ı rollback ile kapattı, canlı veritabanı sorgusu/yazması yok. [Gerçek payload kontrat kanıtı](evidence/design-workspace-fixes/actual165-contracts.json).
- Son inline UI tarayıcı kabulü 1440/1024/390: yatay taşma yok; SKU/barkod araması, manuel seçilen sırayı değiştirme ve gerçek fixture asset listesinden kategori görseli seçimi üç genişlikte başarılı. Mobil reorder/remove hedefleri 44×44px; sabit mobil dock üstündeki kayıt butonunun tam 44px yüksekliği ve merkez hit-test’i 390×900 ve 1024×600’de başarılı. Ortak ayarlar kabulünde 53 ölçüm, 52 PNG var. [Son birleşik UI/build kabulü](settings-approved-release-2026-09-27.md), [ölçümler](evidence/settings-approved-release/viewport-results.json).
- Son UI yedi inline adım kullanır. İç bölüm editörünün Escape ile kapanması ve odağın bölüm butonuna dönmesi korunur. Önceki root modal sunumunda Escape’in iç bölümü kapatıp dış dialogu açık bırakması ayrıca doğrulanmıştı; bu, önceki sunumun kanıtıdır. Gerçek ürün önizlemesi ve pasif satın alma/ödeme doğrulandı; temiz fixture restart sonrasında console hata/uyarı yok.

## Yayın durumu

2026-09-27: dört ortak uygulama aşağıdaki dağıtımlarla aynı incelenmiş kaynak `89cc73218f2a7113f2fd593ca743e45e51621a98` üzerinde tamamlandı. Her dağıtımda üretim derlemesi, TypeScript, sayfa üretimi ve tracing aşamaları başarılı. Runtime kontrolleri çalışan image etiketi/digest’i, SOURCE_COMMIT, kaynak dosyalarının hash’leri ve derlenmiş rota varlığını doğruladı.

| Hedef | Dağıtım | Runtime kaynak/rota | HTTP sağlık | Docker sağlık |
|---|---|---|---|---|
| NET panel | [finished · i118qvye36lonxaf94h7tkx2](evidence/design-workspace-fixes/deployment-panel-net.json) | [PASS · 104 dosya / 27 rota](evidence/design-workspace-fixes/runtime-panel-net.json) | [200 · ok · Redis ready](evidence/design-workspace-fixes/health-panel-net.json) | Healthcheck tanımlı değil; ayrı HTTP kanıtı başarılı |
| SITE panel | [finished · thlao99pmks8ndvotngykh9b](evidence/design-workspace-fixes/deployment-panel-site.json) | [PASS · 104 dosya / 27 rota](evidence/design-workspace-fixes/runtime-panel-site.json) | [İki panel hostu 200 · ok · Redis ready](evidence/design-workspace-fixes/health-panel-site.json) | Healthcheck tanımlı değil; ayrı HTTP kanıtı başarılı |
| SITE storefront | [finished · tq83nl29608yttypk4qgi67m](evidence/design-workspace-fixes/deployment-storefront-site.json) | [PASS · 34 dosya / 7 rota](evidence/design-workspace-fixes/runtime-storefront-site.json) | [Ana sayfa ve health 200 · ok](evidence/design-workspace-fixes/health-storefront-site.json) | healthy |
| NET storefront | [finished · purxjjnpyhpxja7aua2qlf52](evidence/design-workspace-fixes/deployment-storefront-net.json) | [PASS · 34 dosya / 7 rota](evidence/design-workspace-fixes/runtime-storefront-net.json) | [Ana sayfa ve health 200 · ok](evidence/design-workspace-fixes/health-storefront-net.json) | healthy |

[Dört hedef sonrası kontrol](evidence/design-workspace-fixes/verify-after-all-apps.json): aynı commit, targetCount 4, globalIdle true. Hazırlıkta yalnız kaynak dalı/SHA ile mevcut normal SOURCE_COMMIT ve iki PayTR digest değeri güncellendi; diğer uygulama/settings/env nitelikleri ve tüm preview satırları korundu.

### Canlı SQL165 ve veri korunması

Dört yeni uygulama kodu tamamlandıktan sonra son özel yedek alındı; SQL165 up ve assertions exit0 ile tamamlandı. [Yedek/checksum kaydı](evidence/design-workspace-fixes/fresh-pre165-backup.txt) zaman, SHA256, dosya boyutu ve 600 izin bilgisini içerir; özel müşteri payload’ı içermez. Veritabanı dump’ı repo dışında sunucuda kısıtlı izinle saklanır.

- [Canlı korunma kanıtı](evidence/design-workspace-fixes/live165-preservation.json): 10/10 sürüm ve taslak korundu; 10/10 duyuru görünürlüğü/metni ve kategori içeriği korundu. Eksik migrasyon, aynı sürümde belge kayması veya daha sonra değişmiş tasarım yok; mevcut taslak ve yayın validator’ları 10/10 başarılı. Fonksiyon yedeği 9/9, migration artifact ve ACL kontrolleri başarılı.
- [Gerçek canlı payload kontratları](evidence/design-workspace-fixes/live165-contracts.json): son kaynağın workspace, public design ve public presentation parser’ları 10/10 başarılı; tüm 10 workspace assets ve tam publishedDraft içeriyor. Salt okunur canlı transaction rollback ile bitti; müşteri payload’ı kaydedilmedi/yayımlanmadı, canlı mutation ve SQL write yok.

### Canlı UI ve kapanış sınırları

Mira’nın Siora panelindeki salt okunur canlı UI kontrolü başarılı: yedi inline adım, 10 gerçek ürün seçeneği, console hatası yok, tasarım/müşteri mutation’ı yok. [Canlı ölçümler](evidence/settings-approved-release/live/readonly-metrics.json), [yedi adım ekranı](evidence/settings-approved-release/live/design-seven-steps.png) ve ayrıntılı UI sonuçları [birleşik UI raporunda](settings-approved-release-2026-09-27.md) saklanır. Güzide için authenticated UI akışı yapılmadı; SITE HTTP sağlık ve runtime kaynak kanıtları bu akışın yerine kabul edilmez.

Son [22 salt okunur HTTP kontrolü](evidence/design-workspace-fixes/live-final-smoke.json) başarılı: dört admin health 200/ok; oturumsuz tasarım API’leri 401, tasarım ekranları 307 `/login`; iki storefront ana sayfa/health ve canonical politika sayfası 200. Eksik özel sayfa ve eski politika yönlendirmesi mevcut root loading akışından sonra HTTP200 ile gelir; yalnız doğru `NEXT_HTTP_ERROR_FALLBACK;404` + noindex veya `NEXT_REDIRECT;…;308` + politika meta-refresh işaretleri bulunduğunda gate başarılı sayıldı. Bu, [Next.js streamed not-found](https://nextjs.org/docs/app/api-reference/file-conventions/not-found) ve [permanentRedirect](https://nextjs.org/docs/app/api-reference/functions/permanentRedirect) davranışıyla uyumlu; HTML kanıtlara kaydedilmedi.

[Temizlik](evidence/design-workspace-fixes/cleanup-final.json) tamamlandı: yalnız bu çalışmanın izole QA veritabanı, aktif bağlantı olmadığı doğrulandıktan sonra kaldırıldı; geçici Coolify helper dizini temizlendi. Özel tam veritabanı yedeği, şifreli ayar snapshot’ı ve dört dağıtımın sahiplik makbuzu 0600 izinle sunucuda korundu; snapshot ve yedek hash’leri yeniden eşleşti. Canlı veritabanına drop, global image/volume/cache temizliği uygulanmadı. Temizlik sonrası [altı admin/storefront sağlık kontrolü](evidence/design-workspace-fixes/health-after-cleanup.json) 200/ok. [Son salt okunur kaynak pin kontrolü](evidence/design-workspace-fixes/final-source-pins.json) dört hedefte literal `89cc73218f2a7113f2fd593ca743e45e51621a98` ve sıfır aktif dağıtım doğruladı; kapanış belge commitleri yeniden dağıtım başlatmaz.

Root öncesi sunumda tamamlanan ek kontroller: menü seçimindeki kategori/görsel çifti her iki seçim sırasıyla çalışır; eksik çift geçici tutulur ve temizleme atomiktir. Disclosure başlığı link içermez, tıklama/Space ile açılır. Mobil açık menü header’ın tam satırında yer alır:390px ekranında canvas24–366, menü45–345, iç panel62–328; kırpılma yok. İzole fixture yazıları atomik rename ve sürüm kontrolüyle seri hale getirildi; aynı sürümden iki eşzamanlı kaydetme200/409, yazma sırasında50JSON okuma başarılı.
