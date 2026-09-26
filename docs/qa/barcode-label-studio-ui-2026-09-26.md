# Barkod etiketleri — onaylanan arayüz uygulaması

Tarih: 26 Eylül 2026

## Kapsam

Kullanıcının onayladığı HTML tasarımı, ortak müşteri panelindeki gerçek `BarcodeLabelStudio` bileşenine uygulandı. Çalışma `codex/barcode-approved-ui` dalında, son canlı uygulama kaynağı `4353ff4fb9429c6d04c9a4b9852da9115f9ac700` ve onun üzerindeki belge güncellemesi `e94e1c80` temel alınarak yapıldı.

Bu rapor ilk kod kabulünü kaydeder. Kullanıcının sonraki yayın onayıyla iki ortak admin uygulaması canlıya alındı; sonuç [yayın raporunda](barcode-label-studio-release-2026-09-26.md) bulunur. Veritabanı, API ve mağaza verileri değiştirilmedi; yeni bağımlılık eklenmedi.

## Kullanım akışı

1. **Ürünleri seç:** Görünür filtreler, varyant bazında seçim ve adet, stok kadar veya toplu adet uygulama, eksik barkodları oluşturma.
2. **Etiketi düzenle:** Birbirinden farklı termal rulo, A4 tabaka ve özel ölçü çizimleri; hazır ve mağaza şablonları, ölçüler, barkod kaynağı ve formatı, alan seçimi ve sıralaması. Ayrıntılı geometri ve yazı ayarları açılır bölümlerde.
3. **Baskıyı hazırla:** Hazırlık kontrolü, A4 başlangıç hücresi seçimi, PDF ve termal ZPL çıktıları. Tek ana yazdırma düğmesi sabit alt işlem alanında.

Her adımda canlı barkod önizlemesi ve baskı geçmişi erişilebilir. Önizleme seçilen varyantlar arasında dolaşır. Sayfa kimliği ekran okuyucu için korunur; görünür sayfa başlığı ve üst çubukta yinelenen başlık kaldırılmıştır.

Tasarım: `#f8f7f5` zemin, nötr koyu ana işlemler, kontrollü marka turuncusu, açık bölümler ve hafif SVG çizimleri. Mevcut panel navigasyonu korunur.

## İşlem güvenliği

- Varyant sürümü, fiyat anlık görüntüsü, idempotency ve mevcut yetki kontrolleri korunur.
- 500 varyant, 5.000 etiket, tek seferde 200 dahili barkod ve 1.000 üzeri etiket onayı sınırları korunur.
- Adet alanına odaklanmak ürün seçmez; sıfır adet seçimi kaldırır. Sınır nedeniyle reddedilen hızlı seçim sonraki adıma geçmez.
- Baskı ve şablon işlemi hazırlanırken çalışma alanı kilitlenir; paralel geçmiş yükleme veya seçim değişikliği yakalanan baskı verilerini değiştiremez.
- Kullanıcı ayar değiştirdiyse veya baskı/şablon kaydetme başlattıysa gecikmiş mağaza varsayılanı ayarları değiştirmez.
- Yalnızca görüntüleme yetkisiyle önizleme kullanılabilir; barkod üretme, şablon yazma ve çıktı alma kapalıdır.

## Otomatik doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Barkod/etiket yardımcıları ve sunum kuralları | 46/46 geçti |
| Barkod HTTP sözleşmeleri (`react-server` koşulu) | 21/21 geçti |
| Gerçek bileşen davranışı, gecikme ve yetki senaryoları | 12/12 geçti |
| Müşteri paneli üretim derlemesi | Geçti; TypeScript ve sayfa üretimi dahil |

Davranış testleri gerçek seçim, doküman, barkod ve şablon yardımcılarını kullanır. Ağ, önizleme çizimi ve yazdırma penceresi sınırları test ortamında taklit edilir. Sürüm çakışmasında pencerenin iptali, SKU barkod kaynağı, hatalı ilk varyanttan geçerli önizlemeye geçiş, A4 başlangıç sınırı, salt okunur yetki ve gecikmeli yanıtlar ayrıca kontrol edilir.

## Tarayıcı doğrulaması

Gerçek React bileşeni ve gerçek panel çerçevesi, yerel test uygulamasında 8 örnek varyantla incelendi. Test yolları gerçek `/products/barcode-labels` yolunu da sunar. Tüm yazma ve çıktı uçları test uygulamasında 403 döndürür; canlı mağaza verisi veya fiziksel yazıcı kullanılmadı.

| Görünüm | Doğrulanan sonuç |
| --- | --- |
| 1440 × 1000 | Yatay taşma yok; nötr ana düğme, gerçek barkod SVG önizlemesi, yan önizleme alanı |
| 1024 × 1000 | Yatay taşma yok; tek sütun ve mobil menünün üzerinde sabit işlem alanı |
| 390 × 844 | Yatay taşma yok; işlem alanı 16–374 px arasında ve 784 px alt sınırında, 60 px mobil menünün üzerinde |

Mobil A4 hücreleri en az 44 px yüksekliğinde. Beşinci hücre seçildiğinde ilk dört hücrenin atlanması ve seçili hücrenin durumu doğrulandı. Alan ayarları mobilde 358 px çalışma genişliğine sığar. Arama alanının sol boşluğu 40 px; ikon metnin üzerine gelmez.

Baskı geçmişi Escape ile kapanır ve odak açan düğmeye döner. Salt okunur erişimde şablon kaydetme, PDF ve Yazdır düğmeleri kapalı; geçerli barkod önizlemesi açık. Son tarayıcı kontrolünde konsol hatası yok.

Fiziksel yazıcı çıktısı bu arayüz çalışmasında denenmedi. PDF/ZPL üretimi mevcut otomatik sözleşme testleriyle doğrulandı.

## Yeniden çalıştırma

```sh
node --experimental-transform-types --test apps/customer-panel/lib/barcode-labels/*.test.ts
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/barcode-label-http/*.test.ts
node --experimental-transform-types --test --test-timeout=20000 apps/customer-panel/components/catalog-admin/BarcodeLabelStudio.behavior.test.ts
npm run build --workspace @celebix/customer-panel
```

Yerel tarayıcı test uygulaması:

```sh
node node_modules/next/dist/bin/next dev tests/saas-phase3/hemenaku-admin-presentation/browser-fixture --webpack -H 127.0.0.1 -p 3438
```

Yol: `/products/barcode-labels`; salt okunur senaryo: `?readonly=1`.

Test çıktıları yerel olarak `docs/qa/evidence/barcode-approved-ui/` altında tutuldu. Bu klasör depoda mevcut kanıt politikasıyla Git dışında kalır.
