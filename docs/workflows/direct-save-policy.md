# Doğrudan kayıt kuralı

Kullanıcı kararı: 4 Ekim 2026. Başarılı Kaydet/Uygula gerçek kaydı ve amaçlanan etkisini birlikte tamamlar. Müşteriye ayrıca taslak oluşturma ve ikinci yayımlama/etkinleştirme adımı sunulmaz.

- Yeni ürün ve blog/sayfa kaydı doğrudan yayımlanır. Kullanıcının açıkça gizleme veya arşivleme tercihi korunur. Ürün görsellerinin yükleme hatası başarı olarak gösterilmez; aynı işlem güvenle sürdürülebilir.
- Satın alma kaydı sipariş edilmiş, taşıma yolda, yeni sayım sayılıyor olarak oluşur. Gerçek teslim alma ve sayım farkını stoka uygulama ayrı fiziksel işlemlerdir.
- Fiyat, kampanya ve manuel siparişte kayıt ile etkinleştirme/dönüştürme tek sunucu işlemi olur. Hata bütün ara adımları geri alır. Tekrar deneme aynı işlemi sürdürür.
- Kaydet, harici mesaj gönderme veya ödeme tahsil etme anlamına gelmez. Bu eylemlerin mevcut yetki ve doğrulama sınırları korunur.
- Eksik fiyatlı aktarım sessizce taslak oluşturmaz; fiyatın tamamlanması istenir. Kaynak dosyada açıkça kapatılmış kayıtların durumu korunur.
- Eski taslaklar sayfa açılışıyla veya toplu bir arka plan işlemiyle etkinleştirilmez. Form belleği, AI önerisi ve bağlantı kopması kurtarma verisi kullanıcıya ikinci kayıt adımı oluşturmaz.

Bu kural tüm ortak tenant adminleri ve sonraki geliştirmeler için geçerlidir.
