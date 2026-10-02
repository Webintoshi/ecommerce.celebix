# Yeni indirim üst alan temizliği — 2 Ekim 2026

Kaynak: `d1eddfa26a852ddb652c6486604ccd13853f3749`.

## Kapsam

- `/discounts/new` şablon sayacı, arama ve ayrılmış araç çubuğu kaldırıldı.
- Aynı yolun üst boşluğu 12 px; diğer sayfaların boşluğu değişmedi.
- 12 şablon, SVG görseller, seçimler ve klavye odağı korundu.
- Canlı SKU/arama/ödeme kaynakları ve son kabul belgesi normal birleştirme ile korundu.

## Doğrulama

11 hedef test, tip kontrolü ve kesin kaynak için üretim derlemesi geçti. Bağımsız UI incelemesi PASS. Gerçek bileşenlerin yerel sunumunda 1440/1024/390 px: üst boşluk 12 px, ilk satır 13 px, taşma 0, 12 seçim; sayaç/arama yok. Enter düzenleyiciyi açtı, konsol hatası yok.

Tarayıcı oturumu yenilendiğinde canlı giriş korunmadığı için bu son duyarlı görünüm kontrolü yerel, sentetik verili sunumda yapıldı. Canlı kabul her panelde kesin image/SOURCE_COMMIT, 51 kaynak dosyası, 33 derlenmiş rota, derlenmiş 12 px CSS kuralı, SKU davranışı ve mevcut ödeme metadata/authority eşitliğiyle doğrulandı. Ödeme sağlayıcısı çağrılmadı, müşteri kaydı yazılmadı.

## Ortak yayın

NET `jtqplnhlj2qoqx6eirbdpx8g` ve ardından SITE `aiiix81raqsh8uale6cwqw4n` aynı kesin kaynakla finished. İkinci yayın ilk panelin runtime/sağlık kapılarından sonra başlatıldı. Güzide, Butik Siora ve Alpler Spor sağlıkları 200/ok/Redis ready; 63 HTTP/auth kontrolü geçti. Son ortak doğrulama global idle. Ödeme, preview, uygulama ayarları ve iki storefront tanığı ham eşit korundu; storefront yayımlanmadı.

Sanitize kanıtlar: [evidence/discount-template-toolbar-release](evidence/discount-template-toolbar-release/). Gizli snapshot ve şifreli ortam satırları bu kayda eklenmedi.
