# Toshi gerçek AI asistanı: sözleşme ve kalıcılık doğrulaması

Tarih: 26 Eylül 2026. Bu kayıt konuşma sözleşmeleri, repository ve SQL164 için uygulama öncesi/sonrası test kanıtlarını açıklar. Dağıtım, gerçek model çağrısı veya son canlı kabul sonucu içermez; bunlar ayrı yayın kaydında tamamlanır.

## Tasarım ve kapsam

- [Onaylı özellik tasarımı](../superpowers/specs/2026-09-26-toshi-real-ai-assistant-design.md)
- [Uygulama planı](../superpowers/plans/2026-09-26-toshi-real-ai-assistant.md)
- Public sözleşmeler: `packages/saas-contracts/src/toshi/conversations.ts`.
- Kalıcılık: `packages/saas-data/src/toshi-conversations/`.
- Migration: `apps/owner/scripts/sql/saas/202609260164_toshi_conversations.{up,down}.sql`.

Konuşma kullanıcı ve mağazaya bağlıdır. Yeni konuşma mevcut aktif varsayılan sağlayıcı/config/model ile açılır; devam eden konuşma modelini korur. SQL her istekte mevcut tenant, üyelik, plan ve `configuration.read` otoritesini yeniden doğrular. Doğrudan tablo ve private helper erişimi uygulama, workflow ve host resolver rollerine kapalıdır.

`beginTurn` konuşma sürümünü yükseltmez veya mesaj eklemez; yalnız kalıcı operasyon ve 120 saniyelik kullanıcı/mağaza lease'i ayırır. Başarılı `completeTurn` kullanıcı ve asistan mesajını birlikte ekler ve sürümü bir artırır. Tamamlama güncel aktif config, credential sürümü ve model izin listesini yeniden doğrular. Başarısız tur sahte yanıt eklemez. Aynı tamamlanmış operasyon değişmez public sonucu döndürür; aynı başarısız operasyon yeni ücretli çağrıya izin vermez.

## PostgreSQL kanıtlarının sürüm ayrımı

İki rapor farklı snapshot sınırlarını doğrular. İlk raporun migration hash'i son SQL dosyasının hash'i olarak kullanılmamalıdır.

| Kanıt | Migration UP SHA256 | Sonuç | Doğrulanan sınır |
| --- | --- | --- | --- |
| [İlk clone davranış raporu](evidence/toshi-real-ai-assistant/clone-original-limit.json) | `a79519e053a23ecd658031b563bb577fbb150aa91b1f6f997bf27a46c9490876` | 16/16 | İlk `600000` byte snapshot CHECK'i; kısa metinlerle yaşam döngüsü ve otorite |
| [Son Unicode düzeltmesi](evidence/toshi-real-ai-assistant/unicode-snapshot.json) | `da6c070a18ae39c618003038be0bac7f42c5d2c9b24e3826a981f0e1331db801` | 4/4 | Son `2097152` byte snapshot CHECK'i; maksimum uzunlukta 40 Unicode mesaj |

Son SQL164 UP hash'i: **`da6c070a18ae39c618003038be0bac7f42c5d2c9b24e3826a981f0e1331db801`**. Son sınır 2 MiB'dir; browser istemcisinin response sınırıyla uyumludur.

### İlk clone doğrulaması: 16/16

Yalnız `celebix_toshi_ai_qa_20260926` isimli PostgreSQL kopyası kullanıldı. SQL164, dört private tablo ve on fonksiyon ekledi. Önceden bulunan **234 tablonun tam satır digesti** ve **1234 fonksiyonun tanımı/owner/ACL'i** korundu. SQL160–163 dahil mevcut iş otoriteleri değiştirilmedi.

Doğrulanan akışlar:

- Temiz DOWN/UP ile önceki şemanın ve otoritenin aynen geri gelmesi.
- FORCE RLS, private tablolar ve helper EXECUTE reddi.
- Aktif varsayılan sağlayıcı/model/config pinleme; public veride credential bulunmaması.
- Pending replay, değişen payload, başka konuşma üzerinden paralel tur ve commit belirsizliğinin güvenli recovery'si.
- Başarısız operasyonun aynı hata ile tekrar okunması; mesaj ve sürümün değişmemesi.
- Bir kullanıcı/asistan çiftinin atomik tamamlanması ve geçmiş operasyon sonucunun donması.
- Farklı mağaza, aynı mağazadaki başka geçerli kullanıcı ve yanlış üyelik erişiminin reddi.
- Sürüm çatışması; tamamlama sırasında credential rotasyonu, revoke ve model kaldırılmasının kontrolü.
- Model seçimi değişse de devam eden konuşma ve eski replay'in modelinin korunması.
- Dakikada altı generation denemesi; başarısız denemelerin de sayılması.
- Süresi geçmiş lease'in yeni güvenli denemeyi serbest bırakması ve eski operasyonu yeniden çalıştırmaması.
- 100 başarılı turun saklanması, public okumada son 40 mesaj, listede en fazla 20 konuşma ve 101. turun reddi.
- Değişmez audit eventi ve veri içeren DOWN migration'ın reddi.
- Bağımsız iki PostgreSQL oturumunda eşzamanlı ayırmanın seri çalışması; commit edilmiş lease'in ikinci bir ücretli tura izin vermemesi.

Yaşam döngüsü fixture'ları transaction ile geri alındı. Bağımsız concurrency kontrolünün tek iptal edilmiş konuşma/operasyonu yalnız bu disposable clone'da bırakıldı; clone cleanup'ı root yayın akışının sorumluluğudur. Bu rapor cleanup'ın tamamlandığını iddia etmez.

### Unicode düzeltmesi: 4/4

Bağımsız inceleme, geçerli 40 mesajlık çok dilli geçmişin ilk `600000` byte CHECK'ini aşabildiğini gösterdi. Gerçek PostgreSQL testinde önce eski sınırdaki hata yeniden üretildi ve fixture yazmaları geri alındı. Ardından yalnız clone'daki isimli SQL164 snapshot constraint'i, mevcut tanımı doğrulanarak 2 MiB'ye genişletildi.

20 turda kullanıcı metinleri 4000, asistan metinleri 12000 CJK karakteri; her asistan yanıtında izinli sınırlar içinde 12 kaynak kullanıldı. Sonuç **40 mesaj**, **1.114.007 byte public JSON** ve **1.118.002 byte jsonb** oldu. Tamamlama, GET, operasyon replay ve recovery aynı public sonucu döndürdü. Bütün Unicode fixture'ları geri alındı; önceden kalan iptal edilmiş concurrency kaydı aynen korundu.

Bu testlerde provider çağrısı yapılmadı, gerçek API anahtarı okunmadı/çözülmedi ve canlı veritabanına yazılmadı. İlk yaşam döngüsü testinde kullanılan secret envelope yalnız sentetik QA verisiydi.

## Yerel test ve tip kontrolü

[Güncel odaklı doğrulama metadata'sı](evidence/toshi-real-ai-assistant/persistence-verification.json).

Odaklı suite **37/37** geçti:

- Yeni public konuşma parser testleri: 4.
- Mevcut shared export/schema sınırı testleri: 25.
- Repository testleri: 6.
- Migration yapısal güvenlik testleri: 2.

Repository testleri tenant/actor parametrelerini, immutable fingerprint'i, tamamlanmış replay'i, pending/başarısız hata davranışını, commit belirsizliğinde writer'ın yok edilip read-only recovery kullanılmasını, private alan/source reddini ve sınırlı liste DTO'sunu doğrular. Parser testleri accessor çalıştırmadan exact shape reddi, hidden secret alanları, sparse/duplicate/aşırı geçmiş, zaman sırası, dış/API linkleri ve maksimum Unicode metinleri kapsar.

Mevcut frozen export listesi yeni Toshi parser'larıyla güncellendi. Önceki kategori/ölçü sürümlerinden listede eksik kalan üç mevcut export (`parseCatalogCategoryOrderFields`, `parseCatalogCategoryOrderResult`, `parseProductMeasurements`) de beklenen listeye eklendi; ilgili production davranışı değiştirilmedi.

Shared `saas-contracts` ve `saas-data` typecheck kontrolleri ayrıca yapıldı. Bu kayıt panelin genel test paketinin, build'inin veya yayınının sonucunu kapsamaz.

## Clone harness kullanımı

Harness'ler makineye bağlı yol içermez. İki zorunlu değişken tam dosya yolu ister:

- `TOSHI_QA_CONNECTION_FILE`: izinleri `0600` olan private bağlantı dosyası.
- `TOSHI_QA_EVIDENCE_FILE`: güvenli JSON kanıtının yazılacağı tam dosya yolu.

Her harness, bağlantının loopback hostunu ve URL veritabanı adını kontrol eder; bağlandıktan sonra `current_database()` değerini yeniden **`celebix_toshi_ai_qa_20260926`** ile karşılaştırır. Başka veritabanında yazma yapmaz. Connection dosyasının içeriği veya credential çıktıya yazdırılmaz.

Yeni ve temiz named clone üzerinde ilk yaşam döngüsü harness'i:

```sh
TOSHI_QA_CONNECTION_FILE=/absolute/private/qa-connection.txt \
TOSHI_QA_EVIDENCE_FILE=/absolute/private/clone-integration.json \
node tests/saas-phase3/toshi-conversations/clone-integration.mjs
```

Unicode constraint regresyonu:

```sh
TOSHI_QA_CONNECTION_FILE=/absolute/private/qa-connection.txt \
TOSHI_QA_EVIDENCE_FILE=/absolute/private/unicode-snapshot.json \
node tests/saas-phase3/toshi-conversations/unicode-snapshot.mjs
```

İlk harness boş feature tablolarında DOWN/UP yapar; mevcut konuşma/operasyon varsa DOWN koruması çalışır. Unicode harness yalnız isimli feature constraint'i değiştirir, gerçek konuşma fixture'larını geri alır ve clone'daki önceki kayıtları korur. Harness'lerin mutasyonları production doğrulama komutu olarak kullanılmaz. Son portability düzenlemesinde yalnız sözdizimi kontrolü yapıldı; mutating harness yeniden çalıştırılmadı.
