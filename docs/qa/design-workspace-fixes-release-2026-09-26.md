# Tasarım çalışma alanı — düzeltmeler ve yayın doğrulaması

Kapsam: kullanıcı tarafından onaylanan `/settings/design` incelemesindeki D01–D13 ve ikinci aşama maddeleri. Ortak müşteri paneli ve ortak storefront; NET/SITE mağazaları. Uygulama çalışma alanı `codex/design-workspace-fixes`, taban `0adfd8b2`; mevcut panel `d02c4160` ve storefront `8a2281c7` değişiklikleri bu tabanda korunur.

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

Ek düzeltmeler: bölüm boşluk ayarı canlıda uygulanır; kayıt durumu taslak ile yayın ayrımını gösterir; yayınla karşılaştırma ve yayındaki tasarımı taslağa geri alma; gerçek onaylı yorumlar; değer önerisi ekleme/silme; tek modal, Escape sahipliği ve odak dönüşü; yayın sonrası tasarım verisi eski ortak önbellekten okunmaz.

## Son inceleme ile eklenen korumalar

- SQL165 geçiş/geri alma kanıtları alınmadan `storefront_designs` üzerinde `EXCLUSIVE` kilit alınır. Kaydetme çağrıları tamamlanınca devam eder. Daha zayıf kilit gerçek deadlock üretti; son geçişte eşzamanlı kaydetme, eski sürüm çakışması ve değişmiş veri için geri alma reddi 28/28 geçti.
- Yeni seçimleri kabul eden validator yalnız tasarım dokümanlarına uygulanır. Eski merchant composition yazıcısı yeni alanları reddeder; tenant denetimi atlanmaz.
- İçerik sayfasında isteğe bağlı gövde boş metne normalize edilir.
- Editörde geçici alan değişiklikleri güncel bölümün üzerine yalnız değişen alanlar olarak uygulanır; dışarıdan gizleme/geri yükleme en son kaydı ezmez.

## Doğrulama

- Kontratlar: 381/381; SQL artifact/data odaklı kontroller: 24/24; geçiş/concurrency: 28/28.
- Root son editör/workspace modeli/davranış kontrolü: 59/59; son preview/model/loader/renderer grubu: 68/68; gerçek featured-pair composer: 5/5; başlık tıklama renderer: 11/11; mobil paylaşılan bölüm sunumu: 2/2. Panel/storefront/UI paketi typecheck başarılı.
- Owner ve ortak storefront üretim derlemeleri başarılı. Paralelde onaylanan ayarlar commit’i `67bc8621` ile tek ortak sürüm hazırlanıyor; son customer-panel derlemesi birleştirilmiş kaynak üzerinde çalışacak. Root ara panel derlemesi bu gate’i tekrarlamamak için durduruldu, başarılı sayılmadı.
- Gerçek SQL164 canlı veri kopyası: final165 ve assertions başarılı; mevcut yetkiyle taslak kaydetme, yayınlama ve manuel ürün sırası başarılı, prova rollback ile bitti. 10 mağazanın sürümleri, taslakları, görünür duyuruları ve kategori içeriği korundu. [Kopya kanıtı](evidence/design-final/database-exact164-rehearsal.json).
- Tarayıcı 1440/1024/390: yatay taşma yok, barkod/SKU araması ve sıra değişimi başarılı. Escape iç bölümü kapatıp ana dialogu açık bırakıyor ve odağı eski butona döndürüyor. Klavye focus çizgisi görünür. Gerçek ürün seçimi ve pasif satın alma/ödeme doğrulandı; console hata/uyarı yok; fixture API yanıtları 200.

## Yayın durumu

Canlı SQL165 ve dört uygulama dağıtımı henüz yapılmadı. Son source, dağıtım ve runtime kanıtları yayın tamamlanınca bu bölüme işlenecek. Canlı geçiş sırası: dört yeni uygulama kodu önce, sonra son özel yedek ve SQL165. SQL164 verilerinin yeni kontratlarda 10/10 açıldığı rollback-only provayla doğrulandı. SQL165 öncesi yeni özel sayfa ve manuel seçim özelliği geçici olarak tamamlanmamış olacaktır; yayın tamamlanmış sayılmayacaktır. Özel veritabanı yedekleri repo dışında sunucuda izinleri kısıtlı saklanır; müşteri verileri kanıtlara eklenmez.

Son UI ek kontrolleri: menü seçimindeki kategori/görsel çifti her iki seçim sırasıyla çalışır; eksik çift geçici tutulur ve temizleme atomiktir. Disclosure başlığı link içermez, tıklama/Space ile açılır. Mobil açık menü header’ın tam satırında yer alır:390px ekranında canvas24–366, menü45–345, iç panel62–328; kırpılma yok. İzole fixture yazıları atomik rename ve sürüm kontrolüyle seri hale getirildi; aynı sürümden iki eşzamanlı kaydetme200/409, yazma sırasında50JSON okuma başarılı.
