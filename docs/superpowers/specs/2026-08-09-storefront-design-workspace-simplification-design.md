# Storefront Tasarım Çalışma Alanı Sadeleştirme Tasarımı

## Durum

Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

`/settings/design` ekranını teknik bilgi gerektirmeden kullanılabilir hâle getirmek ve mevcut iki anlamlı alanı görünür biçimde ayırmak:

1. **Tüm site** — her sayfada geçerli marka, renk, yazı, menü, ürün, sepet ve footer davranışları.
2. **Ana sayfa** — yalnız mağazanın giriş sayfasında görünen bannerlar, vitrin görselleri, bölümler, kampanyalar ve içerik sırası.

Mevcut PostgreSQL taslak/yayın otoritesi, tenant sınırları, tasarım sözleşmeleri ve storefront render davranışı değişmeyecek.

## Sorun

Mevcut ekran aynı anda iki navigasyon katmanı gösteriyor:

- üst seviyede sekiz bölüm;
- `Tema düzeni` içinde altı bölüm.

`Ana sayfa` etiketi hem üst seviye banner editörünü hem de tema kompozisyonundaki ana sayfa bölümlerini ifade ediyor. Marka, renk, yazı, menü ve duyuru ayarlarının farklı katmanlara dağılması kullanıcının "hangi ayar nereyi değiştiriyor?" sorusunu cevaplamasını zorlaştırıyor.

## Bilgi Mimarisi

### Birinci seviye: iki çalışma alanı

Ekranın üstünde iki büyük fakat profesyonel segment bulunacak:

- **Tüm site** — yardımcı metin: `Logo, renk, yazı, menü ve alışveriş sayfaları`.
- **Ana sayfa** — yardımcı metin: `Bannerlar, vitrin bölümleri ve kampanyalar`.

İlk açılışta **Tüm site** seçilecek. Eski `section` query değerleri uyumluluk için korunacak ve karşılık geldikleri yeni çalışma alanına yönlendirilecek; eski bağlantılar bozulmayacak.

### Tüm site adımları

1. **Marka** — logo, tarayıcı simgesi ve mevcut logo yerleşim/boyut ayarları.
2. **Renk ve yazı** — renkler ile başlık/normal metin tipografisi.
3. **Menü ve duyuru** — header düzeni, ana menü, duyuru şeridi ve hedefi.
4. **Ürün sayfası** — galeri, görünür ürün bilgileri ve miktar seçici.
5. **Sepet** — yan sepet ve ödeme hazırlığı sunumu.
6. **Footer** — bağlantılar, politikalar, bülten ve sosyal profiller.

### Ana sayfa adımları

1. **Bannerlar** — masaüstü/mobil görseller, görünürlük, sıralama ve bağlantı.
2. **Vitrin görselleri** — hero ve kategori görsellerinin mağaza-bazlı R2 yönetimi.
3. **Bölümler** — kategori vitrini, ürün sıraları, ikili kampanya, marka hikâyesi, değer önerileri ve müşteri yorumları.
4. **Kampanya** — yayın aralığı, içerik ve hedef.

`Vitrin görselleri` ekranı yalnız ana sayfaya ait `hero` ve `category` medya türlerini gösterecek. Logo, favicon ve diğer tüm-site medyaları **Tüm site > Marka** altında kalacak. Bu yalnız bir görünüm filtresidir; dosyalar aynı tenant-sınırlı R2 medya otoritesinde saklanmaya devam edecek.

Üst seviyedeki eski `Tema düzeni`, `Vitrin görselleri`, `Marka`, `Renkler`, `Yazı`, `Ana sayfa`, `Promosyon` ve `Duyuru` sekme kalabalığı kaldırılacak. Veri sahipliği değişmeden yalnız sunum katmanı yeniden gruplanacak.

## Etkileşim Tasarımı

- Seçili çalışma alanı ve seçili adım her zaman görünür olacak.
- Masaüstünde adımlar sol tarafta kısa açıklamalı bir liste, düzenleyici orta alanda, canlı önizleme sağda yer alacak.
- Dar ekranda adımlar yatay kaydırılabilir bir satıra dönüşecek; düzenleyici ve önizleme alt alta gelecek.
- Bir adım seçildiğinde yalnız o adımın kontrolleri gösterilecek.
- Teknik veya seyrek kullanılan seçenekler aynı adım içinde varsayılan kapalı **Gelişmiş ayarlar** disclosure alanında bulunacak.
- Kontrol etiketleri sonuç odaklı olacak: `Bannerları göster`, `Miktar seçiciyi göster`, `Logo boyutu` gibi.
- Her adımın başında tek cümlelik `Bu alan nereyi değiştirir?` açıklaması olacak; uzun eğitim metinleri ve tekrar eden uyarı kutuları olmayacak.
- `Taslak kaydedildi`, hata durumu, masaüstü/mobil önizleme ve tek `Yayınla` eylemi üst çubukta korunacak.
- Çalışma alanı veya adım değiştirmek kaydetme/yayınlama yapmayacak ve düzenleme durumunu sıfırlamayacak.

## Bileşen Sınırları

- `DesignWorkspace` iki çalışma alanının ve seçili adımın tek navigasyon sahibi olacak.
- Yeni saf model, eski query bölümlerini yeni çalışma alanı/adım çiftine dönüştürecek ve erişilebilir navigasyon tanımlarını üretecek.
- `DesignInspector` mevcut marka, renk, tipografi, banner, promosyon ve duyuru editörlerini veri sözleşmelerini değiştirmeden sunacak.
- `StarterThemeComposer` yeni bir ikinci navigasyon göstermeyecek; dışarıdan seçilen tek tema adımının panelini render edecek.
- `StorefrontAssetManager`, `CategoryShowcaseEditor`, `StarterFooterEditor` ve bölüm editörlerinin veri arayüzleri korunacak.
- `StorefrontAssetManager` seçili çalışma alanına göre izin verilen medya türlerini gösteren sınırlandırılmış bir görünüm alabilecek; upload endpoint'i ve R2 anahtar otoritesi değişmeyecek.
- Canlı önizleme aynı doğrulanmış taslak nesnesini kullanmaya devam edecek. Browser kaynaklı store/tenant yetkisi eklenmeyecek.

## Veri ve Yetki

- Yeni tablo, migration, API veya tasarım şeması eklenmeyecek.
- Bütün değişiklikler mevcut `StorefrontDesignDocument` ve `StarterThemeCompositionConfigV2` içinde kalacak.
- Taslak otomatik kaydı mevcut debounce ve optimistic-version akışını kullanacak.
- `Yayınla`, PostgreSQL tarafından doğrulanmış atomik yayın otoritesi olmaya devam edecek.
- Salt-okunur roller bütün kontrolleri görebilecek fakat değiştiremeyecek.
- Eski URL query değerleri desteklenecek; bilinmeyen değer güvenli biçimde **Tüm site > Marka** adımına düşecek.

Eski query eşlemesi sabittir:

- `theme`, `brand`, `colors`, `typography`, `announcement` → **Tüm site** içindeki ilgili adım;
- `hero`, `assets`, `promotion` → **Ana sayfa** içindeki ilgili adım;
- query bulunmaması veya bilinmeyen değer → **Tüm site > Marka**.

## Hata ve Durum Davranışı

- Kaydetme hatası üst çubukta kalıcı ve anlaşılır biçimde gösterilecek; çalışma alanı değişimi hatayı gizlemeyecek.
- Yayın engeli ilgili adımın yanında görünür bir işaret oluşturacak ve kullanıcıyı doğrudan o adıma götürecek.
- Medya veya katalog kaynağı yüklenemediğinde yalnız ilgili editör hata gösterecek; diğer adımlar kullanılabilir kalacak.
- Önizleme hazır değilse ayarlar kaybolmayacak ve yayınlanmış mağaza etkilenmeyecek.

## Erişilebilirlik ve Görsel Dil

- Bütün hedefler en az 48×48 piksel olacak.
- Çalışma alanları ve adımlar gerçek `button`/`tab` semantiği, `aria-selected`, `aria-controls` ve görünür odak stilleri kullanacak.
- Turuncu yalnız seçili durum ve ana eylem için kullanılacak.
- Kutu içinde kutu görünümü oluşturulmayacak; açık canvas, ince ayırıcılar ve düzenli boşluk kullanılacak.
- Metin boyutları panelin mevcut profesyonel tasarım sistemiyle uyumlu kalacak; çocukça ikonlar veya aşırı açıklamalar eklenmeyecek.
- `prefers-reduced-motion` korunacak ve dar ekranlarda yatay taşma oluşmayacak.

## Test Stratejisi

1. Failing-first model testleri iki çalışma alanını, doğru adım sırasını, eski query eşlemesini ve güvenli fallback'i doğrulayacak.
2. Workspace kaynak testleri eski sekizli üst rail'in kaldırıldığını, tek publish akışını ve ortak preview otoritesini doğrulayacak.
3. Composer testleri ikinci bir alt navigasyon üretmediğini ve yalnız dışarıdan seçilen paneli render ettiğini doğrulayacak.
4. Negatif güvenlik testleri `storeId`, `tenantId`, `localStorage`, forwarded header veya browser tenant authority eklenmediğini doğrulayacak.
5. Customer-panel test, typecheck ve production build çalıştırılacak.
6. Browser doğrulaması masaüstü ve mobilde iki çalışma alanı, bütün adımlar, klavye navigasyonu, taslak kaydı, reload sonrası kalıcılık ve tek yayın akışını kapsayacak.
7. Güzide staging üzerinde geri döndürülebilir bir taslak/yayın kontrolü yapılacak; production etkisi sıfır olacak.

## Kabul Kriterleri

- İlk bakışta yalnız **Tüm site** ve **Ana sayfa** seçenekleri görülür.
- Aynı anlama gelen iki `Ana sayfa` navigasyonu kalmaz.
- Kullanıcı logo, renk, yazı, menü, ürün, sepet ve footer ayarlarını **Tüm site** altında bulur.
- Kullanıcı banner, vitrin görselleri, ana sayfa bölümleri ve kampanyayı **Ana sayfa** altında bulur.
- Aynı anda yalnız bir ayar adımı açıktır.
- Mevcut kayıtlı Güzide ayarları değişmeden yüklenir ve yayınlanır.
- Storefront görünümü yalnız kullanıcı yeni taslağı yayınladığında değişir.
- Desktop/mobile görünüm, klavye erişimi, 48px hedefler, autosave, conflict ve hata durumları testlerden geçer.
- Production bağlantısı, migration ve yeni veri otoritesi yoktur.

## Kapsam Dışı

- Storefront temasının görsel olarak yeniden tasarlanması.
- Yeni tema şeması veya migration.
- Yeni içerik bölümü türleri.
- Production deploy veya production veri değişikliği.
