# Customer-panel “Mağazayı Gör” üst panel bağlantısı

Durum: Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Customer-panel kullanan mağaza yöneticisi, panelin masaüstü üst çubuğundaki tek bir **Mağazayı Gör** eylemiyle kendi doğrulanmış vitrininin ana sayfasını yeni sekmede açabilmelidir.

## Yetki ve veri akışı

- Yeni API, veritabanı sorgusu veya tarayıcıdan alınan hostname yetkisi eklenmeyecek.
- Kaynak yalnız `TenantContext.resolvedHost` değerinden `createPanelChromeModel` tarafından üretilen mevcut `PanelChromeModel.storefrontHostname` projeksiyonu olacak.
- `createPanelChromeModel` mevcut kurallarıyla aktif mağaza eşleşmesini, aktif host durumunu, store kimliğini, slug eşleşmesini ve canonical hostname biçimini doğrulamaya devam edecek.
- İstemci yalnız doğrulanmış hostname’i `https://<hostname>/` biçiminde sunum bağlantısına çevirecek. `Host`, `Origin`, forwarded header, cookie, query veya mağaza slug’ından URL türetmeyecek.
- `storefrontHostname` bulunmadığında bağlantı gösterilmeyecek. Başka bir hostname’e fallback yapılmayacak.

## Kullanıcı arayüzü

- Bağlantı `PanelTopbarUtilities` içinde, bildirim düğmesinden önce yer alacak.
- Geniş masaüstünde harici bağlantı ikonu ve **Mağazayı Gör** metni gösterilecek.
- Dar masaüstü aralığında metin görsel olarak gizlenebilecek; erişilebilir ad ve en az 48 × 48 piksel hedef korunacak.
- Bağlantı yeni sekmede açılacak ve `target="_blank" rel="noopener noreferrer"` kullanacak.
- Yeni sayfa aksiyonlarıyla ve Tasarım sayfasındaki Yayınla/önizleme kontrolleriyle çakışmayacak.
- Mobil uygulama kabuğu değişmeyecek; bu teslimat yalnız kullanıcının işaret ettiği masaüstü üst panel eylemini kapsar.

## Hata ve güvenlik davranışı

- Doğrulanmış storefront hostu yoksa gizli/fail-closed davranış uygulanır.
- URL’de port, path, query, fragment, credentials veya protokol seçimi kullanıcı girdisinden alınmaz.
- Tam `TenantContext`, store/domain kimlikleri ve oturum bilgileri client bileşenine taşınmaz.
- Production/staging ayrımı, mevcut canonical hostname otoritesinde kalır; sabit Güzide veya production adresi eklenmez.

## Testler

- Doğrulanmış hostname için exact HTTPS kök URL’si render edilir.
- Bağlantıda görünür metin, erişilebilir ad, yeni sekme hedefi ve güvenli `rel` değerleri bulunur.
- Hostname yokken bağlantı render edilmez.
- Bileşen browser header, `window.location`, `process.env`, tenant/store kimliği veya yeni API kullanmaz.
- Üst panel hedefi 48 × 48 piksel altına düşmez ve dar masaüstü kuralı metni güvenle kompaktlaştırır.
- Mevcut panel-shell testleri, customer-panel typecheck/build ve staging tarayıcı smoke testi geçer.

## Değişiklik kapsamı

- `apps/customer-panel/components/panel/PanelTopbarUtilities.tsx`
- `apps/customer-panel/components/panel/panel-shell.module.css`
- `apps/customer-panel/lib/panel-shell.test.ts`
- Bu tasarım belgesi ve takip eden uygulama planı

`apps/admin`, Owner, storefront uygulaması, PostgreSQL migration’ları, production yapılandırması ve kimlik bilgileri değiştirilmeyecek.

## Dağıtım sınırı

Uygulama ve yerel doğrulama sonrasında yalnız Güzide customer-panel staging servisi exact commit SHA ile dağıtılacak. Production, Owner ve storefront deploy edilmeyecek.
