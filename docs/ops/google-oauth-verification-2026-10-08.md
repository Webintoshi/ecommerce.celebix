# Google OAuth doğrulaması — 8 Ekim 2026

## Gerçek durum

- Proje: `Celebix Google Connections` (`utility-liberty-510921-b6`). OAuth istemcisi `Celebix Shared Admin`; tek callback mevcut ortak admin adresidir.
- Audience daha önce **External / In production** yapılmıştı. Tag Manager'daki “Google bu uygulamayı doğrulamadı” ekranı hassas kapsamların henüz doğrulanmadığını gösterir.
- Bu kontrolde marka zaten onaylıydı, fakat yayımlanmamıştı. **Publish branding** tamamlandı; Verification Center artık **Your branding has been verified and is being shown to users** gösteriyor.
- Veri erişimi hâlâ onaysız. **Prepare for verification** erişilebilir. Başvuru, kullanım gerekçesi ve gerçek demo videosu olmadığı için gönderilemiyor.
- Gerçek kaynak davranışına dayanan 959 karakterlik İngilizce kullanım gerekçesi formda hazırlandı. Video alanı boş olduğundan **Save** kapalıdır; gerekçenin Google'a kalıcı kaydedildiği veya başvurunun gönderildiği iddia edilmez.
- Aktif kapsamlar kaynakla eşleşiyor. Hassas kapsamlar: `adwords`, `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, `tagmanager.publish`. Google'ın mevcut sınıflandırmasında `webmasters`, `siteverification`, e-posta ve `openid` hassas olmayan gruptadır. Kısıtlı kapsam yoktur.

## Başvuruyu tamamlamak için

1. Mevcut gizlilik politikasına Google bağlantılarının veri erişimi, kullanım, paylaşım, koruma ve silme davranışını açıklayan ek yayımlanmalı. Canlı `/tr/gizlilik` hâlen genel metindir. Yerel öneri yayımlanmış politika veya işletmenin Limited Use uygunluk beyanı değildir.
2. Bağlantı ekranında bu açıklamaya erişilebilir bağlantı sağlanmalı. Yedek, personel erişimi ve veri talebi/silme süreçleri işletme tarafından netleştirilmeden otomatik silme süresi veya tam uygunluk beyanı verilmemeli.
3. İngilizce OAuth ekranı, görünür istemci kimliği, gerekli GTM ek izinleri ve her hassas kapsamın gerçek kullanımı kaydedilmeli. Parola, OAuth kodu, token ve müşteri verisi videoya alınmamalı. Gerçek hesap/kaynak bilgilerinin liste dışı YouTube'a aktarılması için açık izin alınmalı.
4. Gerçek video bağlantısı ve kapsam gerekçeleri kaydedilmeli; doğruluk/politika beyanı tamamlandıktan sonra Google incelemesine gönderilmeli. Başvuru sonucu ve inceleme onayı ayrı durumlar olarak izlenmeli.

Google güvenlik uyarısını agent geçmez; ilgili Google izin ekranı kullanıcıya bırakılır. Başka bir OAuth projesi veya test modu uyarıyı ortadan kaldıran çözüm sayılmaz.

## Ayrı, sonraki iyileştirme

Search Console için kullanılan `getToken` ve `insert`, `siteverification.verify_only` kabul eder. Mevcut geniş `siteverification` daraltılabilir; kod, Cloud kapsam listesi ve mevcut bağlantıların uyumlu geçişi birlikte ele alınmalıdır. Bu kontrol kaynak, şema, ortam veya dağıtım değiştirmedi. Ads üretim API erişimi ve gerçek GTM/Ads kurulum kabulü ayrıca bekliyor.

## Kanıt ve kaynaklar

Özel ekran görüntüleri `.tmp/google-oauth-verification-20261008/branding-published.png` ve `scope-review-awaiting-video.png` altında tutulur. Kimlik bilgileri repoya eklenmez.

- [Google: doğrulanmamış uygulamalar](https://support.google.com/cloud/answer/7454865?hl=en)
- [Google: hassas kapsam başvuru gereklilikleri](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google: gizlilik politikası gereklilikleri](https://support.google.com/cloud/answer/13806988?hl=en)
- [Site Verification getToken](https://developers.google.com/site-verification/v1/webResource/getToken), [insert](https://developers.google.com/site-verification/v1/webResource/insert)
