# Tema Bağımsız Tek Sayfalık Checkout Tasarımı

Status: Kullanıcı tarafından 2026-07-28 tarihinde onaylandı.

Implementation branch: `codex/celebix-managed-umami-analytics`

Target surface: `apps/storefront-shared`

## 1. Amaç

Celebix'teki bütün mağazalar, seçtikleri katalog temasından, özel temadan veya bağımsız frontend'den bağımsız olarak aynı platform checkout'unu kullanacaktır. Checkout tek sayfalı, mobil öncelikli ve Shopify'ın güncel checkout bilgi mimarisi, oranları ve etkileşim modeliyle görsel/davranışsal uyumlu olacaktır.

Mağaza teması yalnız checkout'a sepet aktarır. Checkout görünümünü, fiyat otoritesini, ödeme yöntemlerini, sağlayıcı secret'larını, sipariş durumunu veya ödeme sonucunu değiştiremez.

Bu çalışma Supabase kullanmaz. Kalıcı otorite self-hosted PostgreSQL'dir ve sunucu bağlantısı mevcut `CELEBIX_SAAS_DATABASE_URL` sınırından kurulur. Tarayıcıya PostgreSQL bağlantı bilgisi, service credential veya tenant kimliği verilmez.

## 2. Araştırma ve mevcut durum

2026-07-28 tarihinde Shopify'ın güncel canlı tek sayfalık checkout'u ve resmi checkout belgeleri incelendi:

- <https://www.shopify.com/checkout>
- <https://shopify.dev/docs/api/checkout-ui-extensions/latest/targets/page-layouts>
- <https://help.shopify.com/en/manual/checkout-settings>

Canlı masaüstü yerleşiminde 1280 piksel görünüm; yaklaşık 690 piksel form kolonu ve 590 piksel özet kolonu kullanıyor. Form içeriği 499 piksel, sipariş özeti içeriği 400 piksel genişliğinde; sağ kolon `#f5f5f5` zemin ve 40 piksel iç boşlukla sticky davranıyor. Bölüm başlıkları yaklaşık 20 piksel, alanlar yaklaşık 47 piksel, ana işlem düğmesi yaklaşık 50 piksel yüksekliğinde. Güncel sıra hızlı ödeme, iletişim, teslimat, kargo, ödeme, siparişi tamamlama ve sipariş özeti biçimindedir.

Celebix'in mevcut durumunda:

- `apps/storefront-shared` exact-host çözümleme ve self-hosted PostgreSQL runtime'ının doğru sahibidir;
- `apps/storefront-shared/app/odeme/hizli/**` yalnız hızlı sipariş akışını sağlar;
- normal `/odeme` sayfası henüz `storefront-shared` içinde yoktur;
- `/api/cart` mevcut durumda güvenli cart credential ile fiyatları PostgreSQL'de doğrulayan terk edilmiş sepet yakalama akışıdır, fakat normal checkout okuma/tamamlama sözleşmesi değildir;
- PayTR/iyzico hosted ödeme otoritesi, callback sınırları, ödeme yöntemleri ve yerleşik havale/kapıda ödeme temelleri mevcuttur;
- `apps/storefront-base` ve tema kopyalarındaki `/odeme` sayfaları legacy/donor koddur; doğrudan Supabase ve tema bağımlılıkları nedeniyle yeni checkout'un otoritesi olamaz.

## 3. Seçenekler ve karar

### A — Platforma ait merkezi checkout

Seçilen yaklaşımdır. `/odeme` ve ilgili commerce API'leri `apps/storefront-shared` içinde yaşar. Sayfa tema component'i, tema CSS'i veya tema runtime değişkeni import etmez.

Avantajları:

- tek görsel ve davranışsal sözleşme;
- tek güvenlik, ödeme ve sipariş otoritesi;
- tema değişiminden etkilenmeyen checkout;
- bütün tenant'larda aynı test matrisinin çalışması;
- provider secret'larının temadan tamamen ayrılması.

### B — Ortak component'i her temaya import etmek

Reddedildi. Kod paylaşımı olsa da tema global CSS'i, layout'u, fontu ve istemci runtime'ı checkout'u etkileyebilir. Dağıtılmış route sahipliği sürüm sapması ve güvenlik sınırı riski oluşturur.

### C — Ayrı checkout alan adı

İlk sürüm için reddedildi. Ayrı domain; cart cookie devri, tenant/host bağlama, CSP, analytics, yönlendirme ve kesinti yönetimini gereksiz biçimde büyütür. Exact-host üzerindeki platform route'u aynı izolasyonu daha az operasyonel riskle sağlar.

## 4. Sahiplik ve tema bağımsızlığı

Yeni sayfa `apps/storefront-shared/app/odeme/page.tsx` altında platform route'u olacaktır. Checkout'a özel component, stil ve server modülleri `apps/storefront-shared` içindeki açık bir checkout/commerce sınırında tutulur.

Sabit kalanlar:

- iki kolon/single-column responsive düzen;
- tipografi, renk paleti, radius, boşluklar ve form component'leri;
- bölüm sırası ve validasyon davranışı;
- ödeme yöntemi sunumu;
- hata, yükleme ve başarı durumları;
- erişilebilirlik ve klavye davranışı.

Mağazaya göre değişebilenler:

- güvenli URL'den gelen mağaza logosu veya logo yoksa mağaza adı;
- ürün adı, varyant, güvenli ürün görseli, adet ve sunucu fiyatı;
- para birimi ve locale;
- kargo seçenekleri ve ücretleri;
- aktif ödeme yöntemleri ve mağaza tarafından girilmiş müşteri talimatları;
- mağaza politika bağlantıları ve izin metinleri.

Tema rengi, tema fontu, tema header/footer'ı, tema section'ları ve tema JavaScript'i checkout'a taşınmaz. Shopify logosu, Shopify metni veya Shopify'a ait asset kullanılmaz; Celebix kendi platform component'lerini ve mağazanın kendi kimliğini gösterir.

## 5. Görsel tasarım

### 5.1 Masaüstü

- Minimum geniş masaüstünde ekran yaklaşık `%54 / %46` iki kolona ayrılır.
- Sol kolon beyazdır; iç içerik maksimum 500 piksel ve sağa yakın merkezlenmiş konumdadır.
- Sağ kolon `#f5f5f5` zeminlidir; içerik maksimum 400 piksel ve viewport içinde sticky'dir.
- Kolon sınırı hafif ton farkıyla belirlenir; ağır kart gölgeleri kullanılmaz.
- Ana font nötr sistem/Inter ailesidir. Metin rengi siyaha yakın, ikincil metin gri, focus halkası yüksek kontrastlıdır.
- Form alanları 46–48 piksel; ana işlem düğmesi yaklaşık 50 piksel yüksekliğindedir.
- Bölümler 24–32 piksel dikey ritimle ayrılır.

### 5.2 Mobil

- 768 pikselin altında tek kolon kullanılır.
- Üstte mağaza kimliği, altında toplamı gösteren açılır/kapanır sipariş özeti bulunur.
- Özet açıldığında ürünler, indirim alanı ve maliyet dökümü gösterilir.
- Form bölümleri DOM sırasında özetten sonra devam eder; masaüstündeki tüm işlevler korunur.
- Ana işlem düğmesi tam genişlikte, en az 48 piksel dokunma yüksekliğindedir.
- Yatay kaydırma, sabit sağ panel veya tema navigasyonu bulunmaz.

### 5.3 Sayfa bölümleri

1. **Üst kimlik:** mağaza logosu/adı, sepete dön bağlantısı ve güvenli ödeme göstergesi.
2. **Hızlı ödeme:** yalnız gerçekten etkin ve desteklenen express/wallet adaptörü varsa gösterilir; yoksa boş/sahte alan çizilmez.
3. **İletişim:** e-posta, isteğe bağlı pazarlama izni ve varsa oturum bilgisi.
4. **Teslimat adresi:** ülke, ad, soyad, şirket (opsiyonel), adres, adres devamı, il, ilçe, posta kodu ve telefon.
5. **Kargo yöntemi:** adres doğrulandıktan sonra sunucudan gelen seçenekler, ücret ve teslimat açıklaması.
6. **Ödeme:** mağaza için aktif yöntemler; tek aktif online sağlayıcı ile etkin havale/kapıda ödeme seçenekleri birlikte gösterilebilir.
7. **Fatura adresi:** varsayılan olarak teslimat adresi; ayrıştırıldığında ayrı alanlar açılır.
8. **Onay ve işlem:** gerekli mesafeli satış/ön bilgilendirme onayları, toplam tutarlı `Siparişi tamamla`/`Şimdi öde` düğmesi.
9. **Sipariş özeti:** ürün görseli, ad/varyant, adet rozeti, satır toplamı, indirim kodu, ara toplam, kargo, indirim ve genel toplam.
10. **Alt bağlantılar:** mağazanın aktif iade, kargo, gizlilik, kullanım ve iletişim politikaları.

## 6. Checkout ve cart otoritesi

Mevcut `__Host-celebix_cart` cookie modeli korunur: cookie rastgele credential taşır, PostgreSQL yalnız SHA-256 digest'i tutar. Cookie `HttpOnly`, `Secure`, `SameSite=Lax` ve `Path=/` olur. Host header, private tenant header veya browser-supplied store ID otorite değildir; mağaza exact trusted hostname'den çözülür.

Normal checkout için mevcut terk edilmiş sepet temeli güvenli biçimde genişletilir:

- credential ve exact host ile aktif cart okunur;
- yalnız product/variant ID ve adet tarayıcı girdisi kabul edilir;
- ürün aktifliği, varyant, fiyat, indirim, vergi, stok ve para birimi PostgreSQL'de yeniden doğrulanır;
- checkout görüntüsü sunucunun güncel quote'unu kullanır;
- istemci toplamı, satır fiyatı, kargo ücreti, provider code'u veya store ID'si kabul edilmez;
- cart version, checkout submit'te optimistic concurrency girdisidir;
- siparişe dönüşüm aynı cart için tekrar çalıştırıldığında ikinci sipariş oluşturmaz.

Normal checkout sözleşmesi hızlı sipariş token sözleşmesinden ayrı olur. Hızlı sipariş route'ları çalışmaya devam eder; yeni `/odeme` bunların güvenlik ve payment adapter temellerini yeniden kullanır fakat quick-link token'ını normal cart otoritesine dönüştürmez.

## 7. Veri ve sunucu akışı

1. Tema veya bağımsız frontend ürün/variant ID ve adetleri same-origin `/api/cart` üzerinden gönderir.
2. Server exact host'u çözer, credential'ı digest eder ve PostgreSQL fiyat/katalog otoritesiyle cart'ı oluşturur veya günceller.
3. `/odeme` server component'i exact host + cookie ile canonical checkout quote ve aktif ödeme yöntemlerini yükler.
4. Adres değiştiğinde bounded same-origin endpoint, kanonik adres girdisiyle kargo seçeneklerini hesaplar; toplamı server yeniden döndürür.
5. Kullanıcı tek bir ödeme yöntemini seçer. Online provider slot'unda yalnız mağazanın aktif ve doğrulanmış tek provider yöntemi sunulur. Havale ve kapıda ödeme bağımsız etkin olabilir.
6. Submit; cart version, server-issued checkout nonce ve idempotency operation ID ile yapılır.
7. PostgreSQL transaction; cart, fiyat, stok, kargo, ödeme yöntemi, provider readiness ve order uniqueness'i tekrar doğrular.
8. Hosted PayTR/iyzico akışında ödeme attempt'i oluşturulur ve mevcut doğrulanmış redirect/iframe adapter'ı başlatılır. Tarayıcı hiçbir provider secret görmez.
9. Havale ve kapıda ödemede sipariş, yönteme uygun `payment_pending`/`awaiting_transfer`/`cash_on_delivery` durumuyla oluşturulur; sahte `paid` durumu üretilmez.
10. Başarılı conversion cart'ı atomik biçimde dönüştürür. Sonuç sayfası yalnız server-authoritative order/payment state gösterir.

## 8. Ödeme yöntemi sunumu

- Bir mağaza aynı anda yalnız bir online provider yöntemi kullanabilir; mevcut PostgreSQL exclusion/unique kuralı otoritedir.
- PayTR veya iyzico etkinse kart seçeneği mağazanın checkout etiketi ve resmi sağlayıcı görseliyle gösterilir.
- Havale etkinse banka adı, maskesiz IBAN ve hesap sahibi yalnız yöntem seçildiğinde güvenli talimat alanında gösterilir. Sipariş oluşturulmadan banka havalesi başarılı ödeme sayılmaz.
- Kapıda ödeme etkinse mağazanın etiketi ve talimatları gösterilir. Ek ücret bu tasarımın kapsamında değildir.
- Emergency-disabled, disabled, unverified veya adapter-ready olmayan yöntem kullanıcıya sunulmaz.
- Hiç kullanılabilir yöntem yoksa işlem düğmesi devre dışıdır ve mağaza sahibine değil son kullanıcıya uygun nötr hata gösterilir.

## 9. Validasyon, hata ve recovery

- Alanlar browser ve server tarafında aynı finite error kodlarıyla doğrulanır; server sonucu otoritedir.
- E-posta, telefon, ülke/il/ilçe ve adres alanları canonical uzunluk ve karakter sınırlarına sahiptir.
- Kargo yeniden hesaplanırken skeleton/pending durumu gösterilir; eski ücretle submit yapılamaz.
- Stok/fiyat/cart version değişirse yeni quote yüklenir ve kullanıcıya değişen satır açıkça gösterilir.
- Duplicate submit aynı operation ID ile replay edilir; yeni sipariş/attempt oluşturmaz.
- Commit sonucu belirsizse kör retry yapılmaz; recovery endpoint canonical durumu okur.
- Provider başlatma hatası siparişi paid yapmaz. Kullanıcı tekrar deneyebilir veya mevcut başka etkin yerleşik yöntemi seçebilir.
- Callback sonucu yalnız mevcut callback authority ve imza doğrulamasıyla state değiştirir.
- Checkout sayfaları `no-store`, `noindex`, `no-referrer` ve uygun clickjacking/content-type/CSP korumalarıyla servis edilir.

## 10. Gizlilik, analytics ve erişilebilirlik

- Analytics olayları yalnız `checkout_started`, bölüm ilerlemesi, yöntemin public code'u, `checkout_submitted` ve sonucun finite durumunu taşır.
- Ad, e-posta, telefon, adres, kart alanı, IBAN veya provider response body analytics'e gönderilmez.
- Her alanın programatik label'ı, autocomplete değeri ve görünür hata mesajı vardır.
- Focus sırası DOM sırasını izler; özet toggle'ı `aria-expanded` kullanır; radio grupları fieldset/legend ile sunulur.
- Hatalar canlı bölgeyle duyurulur, ilk hatalı alana kontrollü focus verilir ve yalnız renkle ifade edilmez.
- Klavye, ekran okuyucu, yüzde 200 zoom, reduced-motion ve yüksek kontrast kabul testlerinin parçasıdır.

## 11. Test stratejisi

Uygulama red-green-refactor ile ilerler.

### Sözleşme ve birim testleri

- cart/checkout request exact-object parsing;
- host + cart credential bağlama ve digest;
- server-side money arithmetic, version ve idempotency;
- adres ve kargo state machine;
- aktif yöntem filtreleme ve tek online provider kuralı;
- havale/kapıda ödeme durum eşlemesi;
- analytics PII redaction.

### PostgreSQL testleri

- iki store ile cart, quote, address, shipping, order ve payment izolasyonu;
- browser fiyatı/toplamı/provider/store ID enjeksiyonunun reddi;
- stok ve fiyat yarışı;
- aynı cart'ın eşzamanlı iki submit'i;
- operation replay ve commit-unknown recovery;
- hosted callback, havale ve kapıda ödeme state'leri;
- migration preflight, role ACL, RLS ve rollback doğrulaması.

### Component ve browser testleri

- Shopify-parity masaüstü düzeni 1280 piksel;
- mobil açılır sipariş özeti 390 piksel;
- iki farklı tema ve iki farklı tenant'ta aynı checkout CSS/DOM kabuğu;
- mağaza logosu yok/yüklü durumları;
- tüm form, kargo ve ödeme etkileşimleri;
- PayTR/iyzico hosted handoff; gerçek ücretli tahsilat yapılmadan sandbox/test fixture doğrulaması;
- havale ve kapıda ödeme tamamlanması;
- boş sepet, fiyat değişimi, stok kaybı, provider outage ve ağ hatası;
- klavye, focus, axe ve screenshot regression.

## 12. Kabul kriterleri

- `/odeme`, farklı temalarda aynı sabit platform görünümünü verir.
- Sayfada `@/lib/supabase`, Supabase paketi, tema component'i, tema global CSS'i veya browser-visible database credential yoktur.
- Bütün tenant ve fiyat otoritesi exact host + self-hosted PostgreSQL tarafından kurulur.
- Masaüstü ve mobil görünüm onaylı Shopify tek sayfalık modelle görsel olarak eşleşir.
- Sepet özeti, adres, kargo ve toplamlar server-authoritative çalışır.
- Etkin tek online provider ile havale/kapıda ödeme doğru biçimde birlikte sunulur.
- Duplicate submit, callback replay ve commit-unknown ikinci sipariş veya sahte ödeme oluşturmaz.
- İki-store isolation, migration/preflight, typecheck, build, component, browser ve payment adapter testleri geçer.
- Deploy sonrası health, commit SHA ve gerçek hostname smoke testleri doğrulanmadan tamamlandı denmez.

## 13. Rollout ve rollback

1. Gerekli additive PostgreSQL migration'ları için backup ve preflight doğrulanır.
2. Checkout cart/quote/order authority uygulama kodundan önce migration ve assertion'larla hazırlanır.
3. Platform checkout feature flag'i başlangıçta kapalı olur; sentetik staging hostlarında açılır.
4. İki sentetik tenant, iki tema ve tüm etkin ödeme türleriyle E2E doğrulanır.
5. Production deploy tek immutable commit'ten yapılır; Coolify commit/health eşleşmesi doğrulanır.
6. Önce sınırlı tenant allowlist, ardından genel platform route'u açılır.
7. Rollback'te feature flag kapanır ve storefront doğrulanmış son platform checkout sürümüne döner veya kontrollü unavailable yanıtı verir; eski Supabase/tema checkout'una fallback yapılmaz. Migration down yalnız yeni kalıcı sipariş/checkout verisi olmadığında çalıştırılır. Ödeme callback authority ve oluşturulmuş siparişler hiçbir durumda silinmez.
