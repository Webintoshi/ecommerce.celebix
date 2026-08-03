# Tema Düzeni Alt Menü Tasarımı

## Amaç

`Tasarım > Tema düzeni` ekranındaki uzun ayar akışını, mağaza yöneticisinin aradığı bölümü kolayca bulabileceği yatay ikinci seviye sekmelere ayırmak. Mevcut tema verisi, canlı önizleme, taslak kaydetme ve yayınlama davranışı değişmeyecek.

## Bilgi mimarisi

Tema düzeni seçildiğinde ana tasarım menüsünün hemen altında şu alt sekmeler gösterilecek:

1. **Genel görünüm** — renk paleti, başlık ve köşe stili, header, bölüm aralığı, ürün kartı ve ürün görsel oranı.
2. **Menü ve duyuru** — duyuru şeridi, duyuru hedefi, ana menü kategorileri ve öne çıkan kategori/görsel.
3. **Ana sayfa** — sıralanabilir ana sayfa bölümleri ve yeni bölüm ekleme.
4. **Ürün sayfası** — galeri, ürün meta alanları, yorumlar, boyut rehberi ve bilgi blokları.
5. **Sepet** — ödeme hazırlığı, kargo ilerlemesi yetki durumu ve güven mesajı.
6. **Footer** — bağlantı grupları, bülten ve sosyal profiller.

İlk açılışta **Genel görünüm** seçili olacak. Kullanıcı sekme değiştirdiğinde bütün düzenleme durumu üst bileşende korunacak; yalnızca görünür ayar paneli değişecek.

## Etkileşim ve görünüm

- Alt menü kutu veya kart kullanmayacak; açık bir yatay satır olacak.
- Aktif sekme turuncu metin ve ince alt çizgiyle belirtilecek.
- Sekmeler gerçek `button` kontrolleri, kapsayıcı `tablist`, içerik ise ilişkili `tabpanel` olacak.
- Dar ekranlarda sekmeler tek satırda kalacak ve yatay kaydırılabilecek.
- Sağdaki canlı önizleme ve iki sütunlu düzen korunacak.
- Hata, başarı, salt-okunur ve yükleniyor durumları sekmelerden bağımsız olarak görünmeye devam edecek.
- Taslak kaydet ve yayınla eylemleri tüm alt sekmeler için ortak kalacak.

## Bileşen sınırları

- `StarterThemeComposer` aktif alt sekmeyi yönetecek ve mevcut `StarterThemeEditorState` nesnesinin tek sahibi olmaya devam edecek.
- Alt menü tanımları sabit, tür güvenli bir liste olacak.
- Mevcut ayar grupları yeni veri modelleri oluşturmadan ilgili `tabpanel` içine taşınacak.
- `StarterFooterEditor`, ana sayfa bölüm editörleri ve önizleme bileşeni mevcut arayüzleriyle korunacak.
- API, veritabanı şeması ve tema kompozisyon formatı değişmeyecek.

## Kaydetme ve hata davranışı

- Sekme değiştirmek ağ isteği başlatmayacak ve formu göndermeyecek.
- Kullanıcı hangi alt sekmedeyken kaydederse kaydetsin bütün `StarterThemeEditorState` mevcut `persist` akışıyla doğrulanıp kaydedilecek.
- Geçersiz kompozisyon, sürüm çakışması ve erişim yetkisi mevcut güvenli hata davranışını koruyacak.
- Sekme değişimi kaydedilmemiş alanları sıfırlamayacak.

## Doğrulama

- Kaynak sözleşme testi altı sekmenin tamamını, erişilebilir `tablist/tab/tabpanel` ilişkisini ve varsayılan **Genel görünüm** durumunu doğrulayacak.
- Test, her mevcut ayar grubunun doğru alt sekmeye bağlandığını ve tek ortak kaydet/yayınla akışının korunduğunu doğrulayacak.
- CSS sözleşme testi yatay, kaydırılabilir, kutusuz alt menü ile turuncu alt çizgili aktif durumu doğrulayacak.
- Production build çalıştırılacak.
- Canlı panelde masaüstü ve dar ekran görünümü, altı sekmeye geçiş, sekmeler arasında kaydedilmemiş durumun korunması ve gerçek taslak kayıt/yenileme akışı test edilecek.

## Kapsam dışı

- Tema veri şemasını değiştirmek.
- Otomatik kaydetme eklemek.
- Mevcut ana Tasarım sekmelerini yeniden adlandırmak.
- Önizleme veya vitrin görünümünü yeniden tasarlamak.
