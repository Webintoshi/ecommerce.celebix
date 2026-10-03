# Mağaza araçları ve iletişim balonu

## Amaç ve kapsam

Ayarlar / Görünüm grubuna Mağaza araçları eklenir. İlk çalışan araç, mağaza sahibinin açıp kapatabildiği tek bir iletişim balonudur. Gelecek araçlar aynı sayfanın kütüphanesine bağımsız eklenebilir. Kullanıcının mevcut uygulama ve yayın yetkisi bu işi kapsar.

## Kullanım

- Ortadaki düzenleme penceresinde İçerik, Görünüm ve Gösterim sekmeleri; Uygula ve Vazgeç. Telefonda tam ekran, işlem düğmeleri erişilebilir. Kayda kadar mağaza değişmez; başarısız kayıt girişleri korur. Başka oturumun kaydı ezilmez. Aynı kaydın belirsiz sonucu aynı işlem anahtarıyla tekrarlanır.
- Kanal seçenekleri: WhatsApp, telefon araması, SMS, e-posta, Instagram, Telegram, Messenger, Google Maps yol tarifi ve mağazanın yayımlanmış iletişim sayfası. Her kanal ayrı açılır, kapatılır ve sıralanır. Etkinleşen kanalda geçerli hedef zorunludur; kapalı kanal dolu olsa da görünmez.
- Başlık, karşılama metni, düğme etiketi, mesaj/kulaklık simgesi, tema/açık/koyu görünümü ve sağ/sol konum. Canlı önizleme navigasyon başlatmaz.
- Masaüstü ve mobil görünürlük, ana sayfa/ürün/kategori/içerik/sepet/arama seçimi. Ödeme, hesap, sağlayıcı ve sonuç sayfaları her zaman dışlanır.
- WhatsApp başlangıç mesajı; isteğe bağlı ürün adı ve canonical ürün adresi. Özel hesap, sepet veya ödeme URL'si, query/hash ya da müşteri bilgisi mesajlara eklenmez.
- Doğrulanmış IANA saat dilimi, seçilen haftanın günleri ve günlük ortak saat aralığı. Mesai dışında gizleme veya bilgilendirme metni. Çalışma saatleri gerçek operatör çevrimiçi durumu gibi gösterilmez. Gece yarısını geçen aralık desteklenir.
- Başlangıçta kapalıdır; kurulumda kişi kanalları otomatik açılmaz. Etkin balon en az bir geçerli etkin kanal, bir cihaz ve bir sayfa türü gerektirir.

## Mimari ve güvenilirlik

`contact_widget` ayrı singleton merchant kaydıdır; mevcut tenant session, configuration.read/manage, CAS ve idempotency altyapısını kullanır. Yeni kayıt aktif olabilir fakat config.enabled balonun görünürlüğünü belirler. Tasarım yayın belgeleri ve genel mağaza ayarları değiştirilmez. Eski kayıtlar otomatik yayımlanmaz.

PublicStorefront exact sözleşmesi değişmez. Doğrulanmış hostname ile ayrı public RPC yalnız o mağazanın geçerli aktif widget'ını döndürür. Eski SQL/okuyucularla yayımlama uyumluluğu korunur; eksik/bozuk widget mağazayı kapatmaz. Public okuyucu admin verisini veya gizli anahtarı taşımaz. Kanallar hedef tipine göre URI üretir; keyfi protokol/HTML/URL kabul edilmez. İletişim sayfası aynı mağazanın yayımlanmış içeriğine bağlanır.

Paylaşılan root layout tek widget mount içerir. Yol değişiminde kurallar güncellenir; mobil alt menü/ürün CTA boşluğu ve açık menü/sepet/modallerle çakışma engellenir. Escape, dışarı tıklama, odak dönüşü ve klavye erişimi; en az 44px hedefler, reduced motion ve safe-area desteği gerekir.

Bu sürüm mağazanın mevcut iletişim uygulamalarına yönlendirme sunar. Mesaj paneli, operatör inbox'ı, otomatik AI cevapları veya üçüncü taraf chat servisi kurulumu bu sözleşmenin kapsamında değildir.

## Kabul ve yayın

Tür/URI/saat/izin/singleton/CAS/idempotency/tenant ayrımı anlamlı testlerle doğrulanır. Uygula, Vazgeç, hatalı giriş, hata sonrası tekrar ve kayıt çakışması; 1440/1024/390 görünümü ve klavye davranışı kontrol edilir. Uyumlu SQL ve storefront okuyucuları önce, ortak admin sonra yayımlanır. Canlıda mevcut mağaza tasarımı veya kullanıcı iletişim verileri değiştirilmeden kontrollü kapalı kayıt ve geri alma doğrulanır. Ödeme yetkileri ve son Lilyum ortak teması korunur.

## Araştırma

- https://chaty.app/help/getting-started/how-to-use-chaty/
- https://chaty.app/help/getting-started/how-to-connect-your-whatsapp-to-chaty/
- https://help.crisp.chat/en/article/how-to-display-channels-contact-information-in-the-chatbox-1p2r14l/
- https://help.crisp.chat/en/article/how-to-schedule-when-to-appear-online-offline-kvso9a/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
