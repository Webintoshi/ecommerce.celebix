# İndirim silme ve tasarım ürün seçimi — canlı kabul

Kabul: **9 Ekim 2026, 20:51 UTC**. [Makbuz](live-release-20261009.json).

Kaynak: `975f9b3950877df9b4be417c1ff653006e08df2e`.

| Ortak panel | Yayın kimliği | Sonuç |
|---|---|---|
| NET | `vabmfvosafxbfgacybaok6m3` | Tamamlandı; çalışan kaynak ve canlı dosyalar doğrulandı |
| SITE | `ysdx8p8migorvx3egsk2ewsc` | NET kabulünden sonra tamamlandı; çalışan kaynak ve canlı dosyalar doğrulandı |

- İndirim listesi ve ayrıntısına doğrudan kalıcı silme eklendi. Etkin araç bağlantısı veya açık ödeme yükümlülüğü silmeyi engeller; geçmiş sipariş ve finans kanıtları korunur.
- Tasarımda kategori kaynağından başka ürün kaynağına geçerken kalan geçersiz kategori alanı temizlendi.
- Native 225 uygulandı. Mevcut 348 tablonun verisi, 1712 değiştirilmeyen fonksiyon ve ödeme/Google/e-posta korumaları doğrulandı.
- Güncel yedek üzerinde izole geri alma/yeniden uygulama ve altı eşzamanlılık senaryosu geçti.
- Yedi yönetim adresinde yeni sekiz dosyanın içeriği eşleşti. Silme ve ürün seçme uçları yetkisiz isteklere 401 döndürdü.
- İki sahip ve iki vitrin uygulaması `446557f574ef3d99081f54f2fe138b1fe487a55a` kaynağında kaldı; yapılandırmalar ve korunan kaynaklar doğrulandı. Son kontrolde yayın kuyruğu boştu.

## Testlerin sınırı

İlgili indirim UI/client/API kontrolleri 93/93, ilgili sunucu/tasarım API kontrolleri 38/38, tasarım UI/önizleme kontrolleri 132/132 geçti. Panel, sözleşme ve veri paketlerinin tip kontrolü ile panel derlemesi geçti.

Geniş panel komutunun ilk bölümü 2357 testte 2295 geçti, 61 başarısız ve 1 atlandı. Başarısız test adları önceki kayıttaki 61 adla aynı; bu sonuç bütün panel testleri geçti anlamına gelmez.

Canlı kabul salt okunurdu; gerçek mağazada Sil veya tasarım Uygula işlemi denenmedi. Gerçek indirim silinmedi, üretime test kaydı eklenmedi ve ödeme/e-posta sağlayıcısı çağrılmadı.
