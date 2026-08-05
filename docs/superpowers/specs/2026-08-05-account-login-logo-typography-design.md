# Evrensel Hesap Girişi Logo ve Tipografi Tasarımı

## Amaç

Tüm mağazaların ortak müşteri hesap giriş ekranını daha sakin ve modern hale getirmek; mağaza adı metni yerine mağazanın yayınlanmış gerçek logosunu göstermek ve mevcut şifresiz giriş davranışını değiştirmemek.

## Kararlar

- Bileşene mağaza adı veya Güzide'ye özel bir varlık sabitlenmeyecek.
- Logo kaynağı mevcut çok kiracılı sırayı koruyacak: yayınlanmış tasarım logosu, mağaza sunum logosu, yalnız logosu olmayan mağazalar için erişilebilir metin geri dönüşü.
- Güzide Kuyumcu'nun mevcut mağazaya özel R2 logosu tasarım belgesine bağlanıp yayınlanacak. Başka mağazanın varlığı kullanılmayacak.
- Sol mesaj `Alışverişiniz, kaldığınız yerden.` olacak.
- Sol mesaj masaüstünde `clamp(38px, 5vw, 68px)`, mobilde `clamp(30px, 9vw, 40px)` olacak.
- Form başlığı masaüstünde `clamp(28px, 3vw, 36px)`, mobilde `clamp(27px, 8vw, 34px)` olacak.
- Logo oranı bozulmadan `object-fit: contain` ile gösterilecek; mobil ve masaüstünde taşmayacak.
- Renkler, mağazanın yayınlanmış marka renklerinden gelmeye devam edecek.
- Sihirli bağlantı, tek kullanımlık kod, misafir ödeme ve hesap oturumu akışlarına dokunulmayacak.
- Tasarımı yayınlamayı engelleyen `draft_updated_at>=published_at` kısıtı kaldırılacak. Taslak kaydı ile daha sonraki yayın zamanı doğal olarak ters sırada olabildiğinden bu kısıt geçerli bir veri değişmezi değildir; yayın RPC'si, yetki kontrolleri ve sürüm kilitleri korunacak.

## Kabul Ölçütleri

1. Güzide giriş ekranının üstünde metin marka adı değil gerçek logo görseli görünür.
2. Sol slogan ve sağ form başlığı önceki sürümden daha küçük ve dengelidir.
3. Slogan tam olarak `Alışverişiniz, kaldığınız yerden.` metnidir.
4. 1440 px, 390 px ve 320 px genişliklerde yatay taşma yoktur.
5. Logosuz mağazalar güvenli metin geri dönüşü ile çalışmaya devam eder.
6. Odak durumları, alan etiketleri ve mağazaya dönüş bağlantısı korunur.
7. Mevcut hesap UI testleri, tip kontrolü ve üretim derlemesi geçer.
8. Bir taslak daha sonraki bir zaman damgasıyla güvenli biçimde yayınlanabilir; doğrudan tablo yazma yetkisi verilmez.
