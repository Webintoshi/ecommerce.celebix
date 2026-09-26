# DeepSeek bağlantıları — 2026-09-26

## Kapsam

Ortak müşteri panelinde `/settings/artificial-intelligence` ekranına dördüncü sağlayıcı **DeepSeek** eklendi. Kendi API anahtarını doğrulama/şifreli saklama, güncelleme, izinli model seçimi, varsayılan yapma ve bağlantı kaldırma mevcut yetki, mağaza, sürüm ve tekrar güvenliğiyle çalışır. API anahtarı yalnız sabit resmî `https://api.deepseek.com/models` adresine sunucudan Bearer başlığında gönderilir; yönlendirme takip edilmez, anahtar tarayıcıya geri dönmez.

Resmî model listesindeki `deepseek-flash` ve `deepseek-v4-pro` desteklenir. Hesap listesinde mevcutsa Flash tercih edilir; kaldırılmış veya bilinmeyen modeller seçilmez. HTTP401/403 geçersiz anahtar, 402 yetersiz bakiye, 429 istek sınırı, timeout ve servis kesintisi güvenli uygulama hatalarına dönüşür. Anahtar doğrulaması ücretli metin üretimi yapmaz ve ücretli kullanım bakiyesini garanti etmez.

Toshi'nin mevcut sohbet bileşeni yerel mağaza komutlarıyla çalışır. Bu yayın sağlayıcı bağlantı yönetimini tamamlar; model üzerinden sohbet/araç yürütme katmanı henüz bağlı değildir. Sonraki entegrasyonda DeepSeek'in varsayılan thinking davranışı ve `reasoning_content` sürekliliği uygulanmalıdır; mevcut klasik mesaj akışı için ilk seçenek `thinking: { type: 'disabled' }` olmalıdır.

## Araştırma

26 Eylül 2026 resmî belgeleri: [model listesi](https://api-docs.deepseek.com/api/list-models/), [fiyatlar](https://api-docs.deepseek.com/quick_start/pricing/), [hata kodları](https://api-docs.deepseek.com/quick_start/error_codes/), [thinking davranışı](https://api-docs.deepseek.com/guides/thinking_mode/), [tool çağrıları](https://api-docs.deepseek.com/guides/tool_calls/).

Flash'ın güncel 1M token fiyatları yoğun olmayan saatlerde önbelleksiz giriş $0.15, çıkış $0.60; yoğun saatlerde $0.30/$1.20. Fiyatlar değişebilir; ürün arayüzüne sabit ücret veya “dünyanın en ucuzu” iddiası eklenmedi.

## Kalıcılık ve uyumluluk

Kaynak `4353ff4fb9429c6d04c9a4b9852da9115f9ac700`, dal `codex/deepseek-toshi`; önceki çalışan kaynak `b2b805ee987f173ce1cbe07bf49c7d406a994e11` ve sipariş yayın kaydı `d4a7e790` korunur. Siparişler, POS, barkod, ölçüler, kategoriler ve SQL160/161/162 üretim kaynakları değişmedi. Önceki ölçü testindeki üç DOM tür hatası, davranışı değiştirmeyen `open` attribute kontrolüyle düzeltildi.

SQL163 iki sağlayıcı kısıtını genişletir, dokuz mevcut fonksiyonu tam önceki kaynak ve tek parça değişim kontrolleriyle günceller, `toshi_provider_list_v2` ekler. Yeni okuyucu dört sağlayıcıyı döndürür; eski okuyucu DeepSeek'i filtreleyerek eski panelin üç sağlayıcılı DTO uyumunu korur. Mevcut sahiplik ve fonksiyon izinleri korunur; yeni okuyucu yalnız owner/app tarafından kullanılabilir.

Kopya testinde ortaya çıkan eski şifreli anahtar doğrulama hatası düzeltildi: PostgreSQL'in desteklemediği `{2,21846}` düzenli ifade tekrarı yerine aynı ASCII kuralı ve ayrı 2–21846 uzunluk sınırı uygulanır. Secret alanları, encryption/AAD, anahtar/digest sınırları değişmedi.

SQL down, aktif veya kaldırılmış DeepSeek kaydı/olayı/işlemi varken veri silmeden durur. Uygulama geri alımında ek şema ve audit kayıtları korunmalıdır; eski okuyucu mevcut üç sağlayıcıyı gösterebilir. Temiz down/up provası kopyada başarılıdır.

## Doğrulama

- 31 adapter, HTTP, runtime, istemci ve gerçek React UI testi: PASS.
- 20 sözleşme/repository/migration testi: PASS.
- Gerçek PostgreSQL kopyasında 16 kontrol: PASS. Bağlama, şifreleme, model, varsayılan, credential rotation, revoke, yetki/mağaza ayrımı, replay/version, eski/yeni liste, sınır değerleri ve rollback/reapply kapsandı. Tüm sentetik yaşam döngüsü kayıtları transaction ile geri alındı.
- Contracts/data/panel tür kontrolleri: PASS.
- Admin ve ortak storefront üretim derlemeleri: PASS.
- İsteğe bağlı ürün ölçülerinin davranış regresyon testi: 1/1 PASS; geçersiz ölçüler görünür doğrulama alır, boş alanlarla atomik kayıt yapılabilir.
- 1440/1024/390 px gerçek UI: dört sağlayıcı, taşma 0, görünür klavye odağı, konsol hatası 0. Bağımsız kaynak ve görsel inceleme: PASS.
- Genel panel test paketi **yeşil değildir**: 1505 testin 1497'si geçti, 7'si başarısız oldu, 1'i atlandı. Altı test aynı değişmemiş önceki sürümde yeniden başarısız oldu; bir Next signed-out integration isteği 90 saniyede zaman aşımına uğradı ve önceki sürümde tekrarlanmış olarak raporlanmadı. Zaman aşımı tek başına regresyon ihtimalini dışlamaz. Tam adlar ve değişmemiş dosya kanıtı [baseline denetiminde](evidence/deepseek-provider/baseline-suite-audit.json). Bu sonuçlar DeepSeek hedef testlerinin başarılarıyla karıştırılmadı.
- Canlı SQL163 uygulaması ve ardından salt okunur veritabanı kontrolü: PASS. Korunan 23 tabloda tüm satır sayıları ve tam satır özetleri aynı; önceki 1233 fonksiyonun sahiplik/izinleri korundu, yalnız dokuz izinli gövde değişti ve bir yetkili okuyucu eklendi. SQL160/161/162 ve özel sağlayıcı tablolarının RLS/izin sınırları doğrulandı. Bu kontrol uygulama dağıtımının veya canlı UI'nin tamamlandığı anlamına gelmez.

[Doğrulama özeti](evidence/deepseek-provider/verification.json), [PostgreSQL kontrolleri](evidence/deepseek-provider/postgresql-behavior.json), [migration haritası](evidence/deepseek-provider/migration-map.json), [canlı SQL163 koruma kontrolü](evidence/deepseek-provider/live-migration.json), [son salt okunur veritabanı kontrolü](evidence/deepseek-provider/final-dbcheck.json), [UI kontrolleri](evidence/deepseek-provider/ui-qa.json), [kaynak bağları](evidence/deepseek-provider/source-binding.json).

## Yayın

İki ortak uygulama aynı `4353ff4fb9429c6d04c9a4b9852da9115f9ac700` kaynağı ve `codex/deepseek-toshi` dalıyla başarıyla yayımlandı:

- Net/Siora: `yldvexpz53qan59mwvsb7o5x`, 16:35:42 UTC tamamlandı.
- Site/Güzide: `njcyru1ka03tn2dzpukijkzq`, 16:40:24 UTC tamamlandı.

Çalışan iki container'ın kaynak ve dosya hashleri, derlenmiş AI/bağlantı/POS/ürün sayfaları, PayTR aday/onay bağları doğrulandı. SOURCE_COMMIT, sağlayıcı onay kapsamları ve deployment hook'ları korunur; auto/preview yayın kapalıdır. Yayın sonrası dört admin adresi HTTP200, Redis ready; iki storefront HTTP200 döndürdü. Siora ve Güzide'de gerçek yetkili ekran dört sağlayıcıyı ve DeepSeek satırını gösterdi; dört boş password alanı, taşma 0, konsol hatası 0. Canlı merchant bağlantısı veya ücretli model çağrısı QA için oluşturulmadı.

Genel paketteki belirsiz yerel Next timeout için ayrıca iki canlı panelde 24 salt okunur, oturumsuz ürün/stok/AI ayar sayfası kontrol edildi: tümü HTTP307 ile `/login` sayfasına yönlendirdi. Bu üretim kontrolü başarısız yerel testi geçmiş olarak değiştirmez; genel paket hâlâ yeşil değildir.

SQL163 canlıya uygulandı; 23 mevcut tablonun tam satır digestleri ve 1233 önceki fonksiyonun sahiplik/izinleri korundu. Beklenen dokuz fonksiyon gövdesi değişti, bir yetkili okuyucu eklendi; son salt okunur denetimde 1234 fonksiyonun tamamı ve SQL160/161/162 doğrulandı. Sonraki migration numarası en az 164 olmalıdır; SQL163 tekrar uygulanmamalıdır.

Yalnız isimle sabitlenmiş geçici QA veritabanı, bu görevin köprüsü/tüneli ve yerel bağlantı dosyası kaldırıldı. İki yedek tutuldu; hashleri ve 0600 izinleri yeniden doğrulandı. Yalnız kullanılmayan build cache temizlendi; uygulama/geri alma image'ları veya volume'lar silinmedi. Son kullanılabilir disk alanı 13.95 GB. Sağlık kontrolleri temizliğin ardından tekrar başarılıdır. Bu yayın kaydının sonraki docs-only commit'i canlı kaynak pinini değiştirmez.

[Deployment kayıtları](evidence/deepseek-provider/deployments.json), [çalışan kaynak denetimi](evidence/deepseek-provider/runtime-verdict.json), [son public config](evidence/deepseek-provider/final-config.json), [sağlık](evidence/deepseek-provider/final-health.json), [canlı UI](evidence/deepseek-provider/live-browser.json), [oturumsuz erişim](evidence/deepseek-provider/live-guard-check.json), [QA temizliği](evidence/deepseek-provider/qa-cleanup.json), [yedek ve kapasite](evidence/deepseek-provider/final-operations.json).
