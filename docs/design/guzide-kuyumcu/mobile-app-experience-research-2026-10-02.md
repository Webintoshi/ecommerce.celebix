# Güzide mobil uygulama deneyimi araştırması

2 Ekim 2026. Araştırma ve öneri; ürün kodu veya yayın değişikliği yapılmadı.
İncelenen kaynak sürümü: `658fcdbfc3804f1cf0d496058ec2226f39044c63`.

## Amaç ve kapsam

Kullanıcı, Güzide’nin telefonda uygulama gibi kullanılmasını ve gerekli araştırmanın yapılmasını istedi. Mevcut onaylı menü, ürün sayfası, gerçek admin verileri ve canlı Bai Jamjuree fontu korunmalı. Geçmiş istekte bu deneyimin diğer müşteriler için de kullanılabilir olması hedeflenmişti; ilk uygulama Güzide’ye özel etkinleştirilmeli, ortaklaştırma kontrollü yapılmalı.

Kullanıcının netleştirdiği kapsam: **“Yalnızca tarayıcıda çok akıcı mobil kullanım.”** Çalışma hızlı ve kararlı mobil alışveriş deneyimine odaklanır. Araştırılan ana ekran kurulumu, PWA manifesti/Service Worker, bildirim ve native mağaza yayını seçilen uygulama kapsamına dahil değildir.

## Sonuç

Önerim, mevcut Next.js navigasyonunu kullanarak alışverişin sürekliliğini ve mobil etkileşim kalitesini geliştirmek. Kontrollü ön yükleme, yerleşimi koruyan yükleme görünümü ve kararlı mağaza çerçevesi, tarayıcıda uygulama gibi gezinme için kullanılabilir. [Next.js gezinme dokümanı](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

## Canlı gözlem

- Güzide 390×844 görünümünde ana sayfa → Kolyeler kategori bağlantısı incelendi. Geçişin ara durumunda yalnız “Mağaza yükleniyor…” göründü; sonra gerçek ürünler geldi. Sürekli görünen mağaza çerçevesi ve kategori düzenine benzeyen yükleme görünümü için somut iyileştirme noktası var. Bu gözlem süre ölçümü değildir.
- Güzide canlı ana sayfa belgesinde manifest bağlantısı, apple-touch-icon ve mobil web-app/theme-color meta alanları yok; standart viewport var. Bu, güncel iOS’ta sitenin ana ekrana hiç eklenemediği anlamına gelmez.
- [Eyyo](https://www.eyyo.com.tr/) telefon boyutunda yeniden incelendi. Alt alanda ana sayfa, arama, menü ve sepet erişimi görsel olarak mevcut; ürünleri yatay sunan bölümler ve büyük görselli alışveriş yapısı görülüyor. Footer T-Soft/Premium bağlantısı içeriyor. Ana belgesinde manifest/apple-touch-icon görülmedi; uygulama hissinin yalnız PWA etiketinden gelmediğine bir örnek.
- Eyyo’nun kampanya penceresi kapalı shadow root içinde otomasyonun tıklamasına izin vermedi. Alt barı görsel olarak gözlemlemek mümkün oldu; arkasındaki tüm akışların ayrıntılı etkileşim testi tamamlanmış gibi değerlendirilmedi. Sunucu iç yapısı ve kullanılan özel tema kesin belirlenmedi.
- Bu inceleme masaüstü tarayıcısının telefon boyutundaki görünümüdür. Fiziksel iPhone/Android, 4G gecikmesi, düşük güçlü cihaz ve gerçek kullanıcı hız ölçümünün yerini tutmaz. “Eyyo’dan hızlı” veya belirli milisaniye kazancı iddiası yoktur.

## Mevcut altyapıda hazır olanlar

| Yetenek | Kod kanıtı | Karar |
| --- | --- | --- |
| Gerçek tenant ve admin marka/menü verileri | [theme.ts](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/guzide/theme.ts:6), [CampaignHeader.tsx](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/components/CampaignHeader.tsx:25) | Kimlik, logo, font ve kategori sözleşmesini koru |
| Tam ekran menü, güvenli ekran kenarları, iç kaydırma, büyük dokunma alanları | [Menü stilleri](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/guzide/guzide-mobile-menu.module.css:9) | Onaylı menüyü temel al |
| Kaydırılabilen ürün galerisi ve erişilebilir yakınlaştırma | [GuzideProductGallery.tsx](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/guzide/GuzideProductGallery.tsx:94) | Yeniden yazma; geçiş ve geri tuşu uyumunu geliştir |
| Sabit satın alma alanı | [GuzideProductPurchase.tsx](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/guzide/GuzideProductPurchase.tsx:120) | Yeni alt navigasyonla üst üste binmesini önle |
| Kalıcı, sunucu otoriteli sepet | [credential.ts](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/lib/cart/credential.ts:132), [client.ts](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/lib/cart/client.ts:143) | Yeni sepet depolama sistemi icat etme |
| Host bazında ayrılmış favoriler ve hesap eşleme | [favorites.ts](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/lib/favorites.ts:49) | Sayaç ve etkileşim sürekliliğini bu yapıya bağla |

## Öncelikli eksikler ve öneriler

| Öncelik | Somut bulgu | Önerilen davranış |
| --- | --- | --- |
| 1 — Gezinme sürekliliği | Güzide’de özel kategoriye dönüş konum saklama yok. Siora/Alpler’de örnek var: [SioraMobileShell](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/siora/SioraMobileShell.tsx:45). Menü geçmişi yalnız yerel durum: [GuzideMobileMenu](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/themes/guzide/GuzideMobileMenu.tsx:26). | Ürün → geri dönüşte aynı liste, sayfa, filtre ve kaydırma konumu. Geri tuşu açık katmanı/alt menüyü önce kapatmalı. Tarayıcının normal geçmişi korunmalı. Varsayılan geri dönüş her zaman bozuk diye kabul edilmemeli; derin liste akışı cihazda test edilmeli. |
| 2 — Geçişlerin akıcılığı | [ProductExplorer](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/components/ProductExplorer.tsx:60) sayfalama ve [arama önerileri](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/components/StorefrontSearchForm.tsx:55) düz bağlantı kullanıyor. Menüde prefetch kapalı; ürün kartlarında Next Link var. | Tam belge yenileten iç geçişleri hedefli düzelt. Bütün kataloğu indirmek yerine olası sonraki sayfayı niyet bazında ön yükle. Bekleme varsa anlık dokunma geri bildirimi ve yerleşimi koruyan kategori/ürün yükleme görünümü göster. |
| 3 — Sabit mobil çerçeve | [Root layout](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/app/layout.tsx:30) çerçeveyi taşımıyor; [StorefrontFrame](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/components/StorefrontFrame.tsx:58) sağlayıcıları her sayfanın içinde kuruyor. | Sayfa değişirken logo, araçlar ve sayaçlar kararlı kalmalı; gereksiz yeniden kurulum/refetch gözlemlenip azaltılmalı. Bu sınır değişikliği birden fazla tenantı etkileyebileceği için ayrı tasarım ve regresyon incelemesi gerektirir. |
| 4 — Tek elle kullanım | Güzide’de sürekli alt erişim çubuğu yok. | Hafif alt bar: Ana Sayfa · Keşfet · Favoriler · Sepet. Hesap ve arama mevcut üst araçlar/menüden erişilir. Üründe mevcut satın alma alanı öncelikli; iki sabit bar yığılmaz. Checkout’ta alt bar kaldırılır. Klavye ve ekran alt boşluğu hesaba katılır. Bu bir tasarım önerisidir. |
| 5 — Görsel ve işlem hafifliği | Galeride ilk fotoğraf öncelikli, devamı lazy-load; ancak gerçek telefon/ağ profili ölçülmedi. | Mevcut fotoğraf kalitesini koruyarak telefonun göstereceği boyutu indir. İlk ekrandaki ana görseli önceliklendir, aşağıdaki içeriği gerektiğinde yükle. Uzun JavaScript işlerini ve gereksiz yeniden render/refetch’i ölçerek azalt. Animasyonlar kısa, yalnız opacity/transform ve reduced motion uyumlu olsun. |

## Araştırılan kurulum alternatifi — seçilen kapsamın dışında

- iOS/iPadOS 26’da ana ekrana eklenen her site varsayılan olarak web uygulaması açılabilir; kullanıcı “Open as Web App” seçimini kapatabilir. Manifest, marka davranışı ve eski sürüm uyumu için yine yararlı. [WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- Chrome’un kurulum tanıtımı için HTTPS, uygulama adı, başlangıç URL’si, görüntüleme modu ve 192/512px ikonlar gerekir. Kurulum önerisinin görünmesi tarayıcı/etkileşim koşullarına bağlıdır. iOS, Android’de kullanılan `beforeinstallprompt` akışını desteklemez. Service Worker bütün platformlarda kurulum için zorunlu bir şart değildir. [Chrome kriterleri](https://web.dev/articles/install-criteria), [MDN kurulabilirlik](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- Bildirimler ilk aşamanın gereği değildir. iOS/iPadOS 16.4+ ana ekran web uygulamalarında kullanıcı eylemiyle izin istenebilir; çapraz tarayıcı uyumu ve abonelik yaşam döngüsü ayrıca gerekir. [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- 44–48px dokunma alanı bir tasarım hedefidir; WCAG’nin geliştirilmiş hedef boyutu ölçütü 44×44 CSS px’dir ve istisnaları vardır. Mevcut menüde bu temel bulunuyor. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

## Veri güncelliği ve tenant sınırları

Seçilen tarayıcı çalışmasında Güzide’nin fiyat/stok verisi güncel sunucu cevabına dayanmalı. Dokunma geri bildirimi hemen gösterilirken sepet sonucunu sunucu doğrulamalı; başarısız istekte durum doğru geri alınmalı. Bağlantı kesildiğinde açık durum ve yeniden deneme gösterilmeli; alışveriş tamamlandı izlenimi verilmemeli. Sırf uygulama hissi için Service Worker eklemek gerekli değildir. Araştırma notu olarak Cache API’nin HTTP önbellek kurallarını otomatik uygulamadığı doğrulandı. [MDN Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache).

Mevcut [proxy.ts](/Users/Celebix/.codex/worktrees/guzide-deniz-theme/Saas-Celebix/apps/storefront-shared/proxy.ts:221), private/no-store ve kısıtlı CSP kullanıyor. Seçilen kapsamda CSP/cache kurallarını topluca gevşetme gereği yok. Gelecekte kurulum katmanı ayrı istenirse manifest/worker için dar politika ayrıca tasarlanmalıdır. [MDN manifest-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/manifest-src), [MDN worker-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src).

Kayıtlı gezinme durumu mağaza kimliği ve host ile ayrılmalı. Tarayıcı geçmişi, özel alan adı, giriş ve ödeme dönüş URL’leri test edilmelidir. İlk uygulama exact Güzide tenant guard’ıyla yapılmalı. Ortak davranışa taşınırsa her mağaza admin logosunu, renklerini, mevcut fontunu ve kategori verisini kullanmalı.

## Uygulama sırası ve kabul ölçütleri

1. Gerçek iPhone Safari ve Android Chrome’da ilk açılış, sıcak açılış, kategori→ürün→geri ve sepet akışının baz ölçümünü al.
2. Gezinme sürekliliği, geri tuşu ve hedefli iç bağlantı iyileştirmelerini tamamla.
3. Güzide’ye ait hafif mobil çerçeve ve sayfaya özgü yükleme görünümünü tasarla; mevcut font ve onaylı yüzeyleri koru.
4. Telefon boyutuna uygun görsel yükünü ve etkileşim sırasında uzun işleri ölçerek azalt; kalıcı sepet/favori davranışını sunucu sonucu ile doğrula.
5. Gerçek iPhone/Android tarayıcıda geri dönüş, klavye, bağlantı kesintisi, giriş ve ödeme dönüşünü yeniden ölç; ortak tenant regresyonunu tamamla.

Hız hedefi, gerçek mobil ziyaretlerin 75. yüzdeliğinde LCP ≤2,5 saniye, INP ≤200ms, CLS ≤0,1. Bunlar mevcut Güzide için ölçülmüş sonuçlar değildir. [Google Core Web Vitals eşikleri](https://web.dev/articles/defining-core-web-vitals-thresholds), [INP iyileştirme](https://web.dev/articles/optimize-inp).

Ek kabul: derin listeden geri dönünce doğru konum; menü/galeri/sepet katmanında geri tuşu tutarlı; çift dokunmada sepet/sipariş tekrarı yok; sayaçlar gereksiz sıfırlanmaz; input klavyesi ve alt bar içerik kapatmaz; fiyat canlı doğrulanır; reduced motion uyumu korunur; diğer tenantlarda mevcut akış değişmez.

Bu raporun tamamlanması uygulama kodunun veya yeni tasarımın tamamlandığı anlamına gelmez. Bir sonraki ürün çalışması, bu önerilerden seçilen kapsamın somut tasarımı ve doğrulanabilir uygulaması olmalıdır.
