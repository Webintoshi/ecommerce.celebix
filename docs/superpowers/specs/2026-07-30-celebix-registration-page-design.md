# Celebix Kayıt Sayfası Tasarımı

## Amaç

`/kayit` sayfasını, kullanıcı tarafından verilen İkas referansındaki net iki sütunlu akışa yaklaştırırken Celebix'in turuncu ve antrasit marka kimliğini koruyan, sade ve responsive bir kayıt deneyimine dönüştürmek.

## Onaylanan yön

- Masaüstünde solda kayıt formu, sağda geniş tanıtım paneli bulunacak.
- Celebix'in mevcut üretim logosu kullanılacak; yeni veya geçici logo üretilmeyecek.
- Sağ panelin ana mesajı **“Ücretsiz E-Ticaret Yolculuğunu Başlat”** olacak.
- Para tutarı veya doğrulanmamış kampanya vaadi kullanılmayacak.
- Mevcut kayıt API'si, validasyon, mağaza adresi önerisi, şifre görünürlüğü, onay kutuları ve başarılı kayıt görünümü değişmeden korunacak.

## Görsel sistem

### Sol kayıt alanı

- Beyaz zemin ve maksimum okunabilir form genişliği.
- Üst sırada Celebix logosu ile “Zaten hesabınız var mı? Giriş Yap” bağlantısı.
- Başlık ve açıklama formdan önce; alanlar referanstaki gibi düzenli, düşük yoğunluklu ve geniş dokunma hedeflerine sahip.
- Ad ve soyad ile telefon ve e-posta masaüstünde ikili, dar ekranlarda tek sütun.
- Odak, hata ve ana buton durumlarında Celebix turuncusu kullanılacak.

### Sağ tanıtım alanı

- Açık sıcak gri/turuncu tonlu, yuvarlatılmış ve ince çerçeveli panel.
- Üstte “Celebix • KOBİ'lerin yanında” etiketi.
- Ortada CSS ile oluşturulmuş sade mağaza/başlangıç görseli; harici görsel bağımlılığı olmayacak.
- Altta turuncu vurgulu **“Ücretsiz”** kelimesiyle “E-Ticaret Yolculuğunu Başlat” başlığı ve kısa destek metni.
- Dekoratif öğeler erişilebilirlik ağacından gizlenecek.

## Responsive davranış

- `1100px` altında iki sütun tek sütuna dönecek.
- Form her zaman ilk sırada kalacak; tanıtım paneli formun altında daha kompakt gösterilecek.
- `640px` altında ikili form alanları tek sütuna inecek, dış boşluklar ve panel yüksekliği azaltılacak.
- Yatay taşma olmayacak ve kontrol yükseklikleri mobil dokunmaya uygun kalacak.

## Erişilebilirlik ve davranış

- Ana başlık ilişkisi ve form bölümünün erişilebilir adı korunacak.
- Tanıtım alanı `aside` olarak işaretlenecek ve başlığıyla ilişkilendirilecek.
- Klavye odağı görünür kalacak; hata durumları mevcut `aria-invalid` işaretlerini kullanmaya devam edecek.
- Kayıt kapalı durumunda aynı sol alan içinde açıklayıcı durum kartı gösterilecek.

## Doğrulama kapsamı

- Mevcut `/kayit` sözleşme testleri çalıştırılacak.
- Owner uygulaması typecheck ve production build ile doğrulanacak.
- Masaüstü ve mobil görünüm tarayıcıda açılıp taşma, sıralama ve temel form etkileşimleri kontrol edilecek.

