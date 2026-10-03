# Sidebar mağaza kimliği

Kullanıcı logo yüklü ve logosuz HTML önerisini 2026-10-03 tarihinde “evet uygula” ile onayladı.

## Birincil görev ve işlev envanteri

Birincil görev: doğru mağazayı tanımak ve mevcut panel menüsünü kullanmak.

- Görünen bilgi: etkin mağaza görünen adı, varsa yayımlanmış logosu, mevcut üyelik rolü ve aktif sayfa.
- Gezinme: mevcut ana bağlantılar, ayrı alt menü aç/kapa, arama ve Cmd/Ctrl+K/ArrowDown/Escape.
- Mağaza geçişi: mevcut POST /api/session/switch formu ve destinationStoreId seçimi.
- Çıkış: mevcut POST /api/session/logout; Celebix ana sayfa bağlantısı.
- Mobil: mevcut sağ drawer ve dock; close/backdrop/Escape/swipe, focus trap/restore ve scroll lock.
- Kasiyer: mevcut register gezinme modu.
- Durumlar: yayımlanmış logo, logosuz, görsel yükleme hatası, uzun ad; aynı menü işlevleri korunur.

## Onaylı yerleşim

245 px grafit masaüstü menüsü, nötr seçili satır ve #f8f7f5 zemin korunur. Tek mağaza kimliği üsttedir. Logo contain ile küçük açık yüzeyde durur; ad ve mevcut rol yanında görünür. Logo yoksa veya yüklenemezse ad ve rol tek başına kalır. Yapay avatar ve yinelenen alt kimlik kaldırılır. Çoklu mağaza seçimi aynı kimlikteki mevcut formdan yapılır.

Celebix logosu ve Çıkış alttadır. Üst/alt alanlar sabit; yalnız mevcut menü kaydırılır. Mobil başlık mağaza kimliği ve close düğmesidir; Celebix mobil drawer’ın altında da ana sayfaya bağlanır ve drawer’ı kapatır.

## Dar veri sınırı

Atlas, mevcut shared pool üzerinde mevcut public storefront/published design READ ONLY repository okumalarını onayladı. Tam workspace, taslak, asset library, yeni SQL/API/yetki veya ödeme değişimi kullanılmaz. Authenticated tenant/canonical host ve public storefront id/slug/host eşleşmesi zorunludur. Client’a yalnız storeDisplayName/storeLogoUrl gelir. Hata metin görünümüne döner. Bağımsız shell okumaları birlikte yürütülür; browser’a yeni fetch veya kitaplık eklenmez.

Mevcut legacy_https public logo sözleşmesi korunur; bu istisna yeni aktif medya doğrulaması olarak tanımlanmaz.

Bu onay uygulama kodlaması içindir; bu görevde canlı yayın yapılmaz.
