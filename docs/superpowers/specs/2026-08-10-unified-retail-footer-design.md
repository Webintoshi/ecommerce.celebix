# Birleşik Retail Footer Tasarımı

Durum: Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Starter storefront footer'ındaki bülten ve bağlantı alanlarını tek, temiz ve tutarlı bir görsel yüzeyde birleştirmek. Mevcut durumda bülten bandı `#050505`, alt footer ise `#121518` kullandığı için footer iki ilgisiz blok gibi görünmektedir.

## Kapsam

- Hedef yüzey `apps/storefront-shared` retail footer'ıdır.
- `RetailFooter` veri sözleşmesi, newsletter API davranışı ve admin panelindeki açık/koyu ton yetkisi değişmeyecektir.
- Masaüstü ve mobil düzen birlikte iyileştirilecektir.
- Mevcut erişilebilir mobil `<details>/<summary>` yapısı korunacaktır.

## Görsel Tasarım

- Koyu tonda bülten, bağlantılar, sosyal bağlantılar ve copyright alanı aynı `#101214` arka planını kullanır.
- Açık ton da tek bir ortak footer arka plan değişkeni kullanır; bülten için ayrı hardcoded koyu yüzey oluşturulmaz.
- Bülten ve bağlantı alanları renk değişimi yerine düşük kontrastlı bir ayırıcı çizgiyle ayrılır.
- İçerikler aynı `store-container` genişliğine ve aynı yatay hizaya bağlanır.
- Bülten başlığı daha kontrollü ölçekte, form ise okunaklı ve dengeli iki kolonlu düzende kalır.
- Alt link alanının dikey boşluğu azaltılır; marka, link grupları ve alt bilgi daha sıkı bir ritim kullanır.
- Metin ve çizgi renkleri footer tonuna ait CSS değişkenlerinden türetilir.

## Etkileşim ve Erişilebilirlik

- E-posta alanı, `Kaydol` düğmesi, onay kutusu ve canlı durum mesajı korunur.
- Etkileşim hedefleri en az 48 px kalır.
- Klavye odağı, form etiketleri ve mobil disclosure semantiği değişmez.
- Dar ekranlarda bülten tek kolona iner; link grupları açılır başlıklar olarak kalır.

## Test ve Kabul Kriterleri

- Kaynak/CSS testi bülten bandının ayrı hardcoded arka plan kullanmadığını kanıtlar.
- Koyu ve açık footer tonlarında bülten ile alt footer aynı arka plan değişkenini kullanır.
- Bülten ile link alanı yalnız ayırıcı çizgiyle ayrılır.
- Retail footer unit/static testleri, storefront typecheck ve build geçer.
- Canlı staging masaüstü ve mobil görünümünde renk kırılması, yatay taşma veya framework hatası bulunmaz.
- Newsletter form etkileşimi ve mobil disclosure davranışı korunur.

## Kapsam Dışı

- Footer veri şeması veya migration değişikliği.
- Newsletter endpoint ya da abonelik iş mantığı değişikliği.
- Production deploy.
- Owner veya customer-panel deploy.
