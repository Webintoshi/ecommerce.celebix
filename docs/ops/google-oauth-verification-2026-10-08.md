# Google OAuth doğrulaması — 8 Ekim 2026

## Gerçek durum

- Proje: `Celebix Google Connections` (`utility-liberty-510921-b6`). OAuth istemcisi `Celebix Shared Admin`; tek callback mevcut ortak admin adresidir.
- Audience daha önce **External / In production** yapılmıştı. Tag Manager'daki “Google bu uygulamayı doğrulamadı” ekranı hassas kapsamların henüz doğrulanmadığını gösterir.
- Bu kontrolde marka zaten onaylıydı, fakat yayımlanmamıştı. **Publish branding** tamamlandı; Verification Center artık **Your branding has been verified and is being shown to users** gösteriyor.
- Veri erişimi hâlâ onaysız. **Prepare for verification** erişilebilir. Başvuru, kullanım gerekçesi ve gerçek demo videosu olmadığı için gönderilemiyor.
- Gerçek kaynak davranışına dayanan 959 karakterlik İngilizce kullanım gerekçesi formda hazırlandı. Video alanı boş olduğundan **Save** kapalıdır; gerekçenin Google'a kalıcı kaydedildiği veya başvurunun gönderildiği iddia edilmez.
- Aktif kapsamlar kaynakla eşleşiyor. Hassas kapsamlar: `adwords`, `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, `tagmanager.publish`. Google'ın mevcut sınıflandırmasında `webmasters`, `siteverification`, e-posta ve `openid` hassas olmayan gruptadır. Kısıtlı kapsam yoktur.

## Başvuruyu tamamlamak için

1. Google veri kullanımı eki kullanıcının açık onayıyla `/tr/gizlilik` ve EN karşılığında yayımlandı. Erişim, kullanım, şifreli saklama ve bağlantı kesmenin gerçek davranışı açıklanır; otomatik saklama süresi veya doğrulanmamış Limited Use uygunluk beyanı verilmez.
2. Bütün Google bağlantı pencerelerinde canlı gizlilik bağlantısı iki ortak admin üzerinde yayımlandı. Yedek, personel erişimi ve veri talebi/silme süreçleri işletme tarafından netleştirilmeden ek süre veya tam uygunluk beyanı verilmemeli.
3. İngilizce OAuth ekranı, görünür istemci kimliği, ilk bağlantıda birlikte istenen bütün GTM izinleri ve her hassas kapsamın gerçek kullanımı kaydedilmeli. Parola, OAuth kodu, token ve müşteri verisi videoya alınmamalı. Gerçek hesap/kaynak bilgilerinin liste dışı YouTube'a aktarılması için açık izin alınmalı.
4. Gerçek video bağlantısı ve kapsam gerekçeleri kaydedilmeli; doğruluk/politika beyanı tamamlandıktan sonra Google incelemesine gönderilmeli. Başvuru sonucu ve inceleme onayı ayrı durumlar olarak izlenmeli.

Google güvenlik uyarısını agent geçmez; ilgili Google izin ekranı kullanıcıya bırakılır. Başka bir OAuth projesi veya test modu uyarıyı ortadan kaldıran çözüm sayılmaz.

## Ayrı, sonraki iyileştirme

Search Console için kullanılan `getToken` ve `insert`, `siteverification.verify_only` kabul eder. Mevcut geniş `siteverification` daraltılabilir; kod, Cloud kapsam listesi ve mevcut bağlantıların uyumlu geçişi birlikte ele alınmalıdır. Bu arayüz/gizlilik yayını kapsamları, şemayı veya sunucu ortamını değiştirmedi. Ads üretim API erişimi ve gerçek GTM/Ads kurulum kabulü ayrıca bekliyor.

## Tamamlanan gizlilik ve arayüz yayını

- Kamu sitesi yalnız gizlilik değişikliğiyle `55369e5f8da743d2805a60ae916d985dc3d62d9d` kaynağına yayımlandı; doğrudan tabanı önceki gerçek canlı `7455ab335ef44a1abcf31161222ebff97061d539`. Coolify işlemi `f4de3328213d3ea5984413d30846522f` finished; TR/EN HTTP200 ve gerçek Chrome kabulü tamamlandı. Sunucu ortamı ve SaaS uygulamaları korundu.
- Kamu `main` kaynağı `0f505c060f87e695e3fe1ba28ac812148f965182` korunmuştur. Güncel-main tabanlı aynı ek `b90c6277e6d8e36c0166821f672f37827a7e1131` adayında vardır; sonraki main yayınında bu ek de korunmalıdır. Mevcut diğer blog/middleware farkları bu yayına alınmadı.
- Ortak admin arayüzü `625644c075c78438a725eb654f3ea895d4494716`: NET `hv3d3z80r50x17ctlne38ap4` → SITE `hxnaqa3b2mk5ftimei5xuym7` finished. Son kök kontrolü global kuyrukların boşluğunu, iki panel kaynağını, ödeme/Google/keyring/ham ortam kayıtlarını ve iki değişmeyen vitrin konteynerini doğruladı. Yeni SQL veya ortam kaydı yoktur.
- GTM penceresinde **Yeni Tag Manager hesabı oluştur** bağlantısı Google'ın resmî arayüzünü açar. Hesap oluşturma API'de bulunmadığı için Google'daki **Hesap Oluştur** işlemi kullanılır; sonra panelden liste yenilenir. Erişilebilir hesapta mağaza konteyneri oluşturma akışı korunur.
- 24 davranış testi, üretim derlemesi ve bağımsız inceleme geçti. Güzide'nin oturumlu Chrome kabulünde yeni bağlantı/etiket/gizlilik, resmî Google hesabı oluşturma girişi, yenileme sonrası hesap/konteyner seçiminin korunması ve Vazgeç doğrulandı. Yeni ek için 390 piksel denemesi gerçek ekranı değiştirmedi (1680 piksel gözlendi); ayrı mobil canlı kabulü iddia edilmez. Google kurulumuna Uygula veya sağlayıcı mutasyonu yapılmadı.

## Yerel kullanıcı kaydı ve bekleyen adımlar

Kullanıcının 24,61 saniyelik Masaüstü videosu Google giriş/izin akışını ve GTM hesap listesine dönüşü gösterir. Ayrıntılı kapsamlar, GTM Uygula/yayın sonucu ve Ads kullanım kanıtı eksiktir. İlgisiz Google hesap kimlikleri de görünür; video yerelde tutuldu, YouTube'a yüklenmedi. Başvuru hâlâ gönderilmemiştir. Güvenlik uyarısı ve Google izinleri kullanıcı tarafından tamamlanmalıdır.

Arayüz kabulünden sonra kullanıcı Chrome'da yeni Güzide GTM hesabını/konteynerini seçip kurulumu tamamladı. Gerçek ekranda **Bağlantı uygulandı / Bağlı**, `guzidekuyumcu.com` ve `GTM-P8PBNLXG` görüldü. Root Uygula veya Google izin düğmesine basmadı; bu kullanıcı işlemi ortak arayüz yayınının sağlayıcı mutasyonu değildir. Bu ekran kanıtı, tüm kapsamların demo videosu veya gerçek ziyaretçi ölçüm kabulünün tamamlandığı anlamına gelmez.

## Kanıt ve kaynaklar

Özel ekran görüntüleri `.tmp/google-oauth-verification-20261008/branding-published.png` ve `scope-review-awaiting-video.png` altında tutulur. Kimlik bilgileri repoya eklenmez.

- [Google: doğrulanmamış uygulamalar](https://support.google.com/cloud/answer/7454865?hl=en)
- [Google: hassas kapsam başvuru gereklilikleri](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google: gizlilik politikası gereklilikleri](https://support.google.com/cloud/answer/13806988?hl=en)
- [Site Verification getToken](https://developers.google.com/site-verification/v1/webResource/getToken), [insert](https://developers.google.com/site-verification/v1/webResource/insert)
