# Güvenli Çoklu Mağaza Admin Girişi Tasarımı

Tarih: 30 Temmuz 2026  
Durum: Kullanıcı tarafından yönü onaylandı; uygulama planı öncesi spesifikasyon incelemesi bekleniyor.

## 1. Problem

Müşteri admin uygulaması Logto ile kimlik doğruluyor ve her mağazanın self-hosted PostgreSQL veritabanında yerel bir yetki üyeliği arıyor. Ancak Owner panelindeki `createOrAssignStoreAdmin` akışı yeni `light_postgres + logto` standardını tamamlamıyor; eski Supabase kullanıcı/profil yolunda kalıyor. Sonuç olarak aynı yönetici birden fazla mağazaya güvenilir biçimde atanamıyor ve callback katmanındaki teknik hatalar kullanıcıya yalnızca `login_failed` olarak dönüyor.

Canlı Hemenaku kontrolünde anonim OIDC başlangıcı doğru biçimde Logto giriş ekranına yönlendi. Tarayıcıda mevcut bir Logto oturumu kullanıldığında callback `/admin/login?error=login_failed` adresine döndü. Mevcut callback; token değişimi, kullanıcı bilgisi ve PostgreSQL üyelik sorgusu hatalarını aynı genel kodda birleştirdiği için canlı hatanın hangi aşamada olduğunu kullanıcıya veya operatöre açıklamıyor.

## 2. Hedefler

- Tek bir Logto kimliği birden fazla müşteri mağazasına atanabilsin.
- Aynı yönetici her mağazada aynı e-posta ve Logto `subject` değeriyle çalışsın; mağaza başına ayrı parola oluşturulmasın.
- Yönetici yalnızca aktif üyeliği bulunan mağazalara girebilsin.
- Self-hosted PostgreSQL mağazalarında admin ataması Owner panelinden uçtan uca çalışsın.
- Callback hataları güvenli ama eyleme dönük hata kodlarına ayrılsın.
- Yanlış Logto hesabıyla gelen yönetici güvenli biçimde başka hesap seçebilsin.
- Oturum, yönlendirme, çıkış ve çoklu mağaza erişimi otomatik ve canlı tarayıcı testleriyle doğrulansın.

## 3. Hedef Dışı Konular

- Her Logto kullanıcısına tüm mağazaları açmak.
- Bu aşamada yeni bir global Celebix operasyon rolü oluşturmak.
- Legacy Supabase mağazalarının kimlik mimarisini topluca dönüştürmek.
- Admin panelinin giriş dışındaki sayfalarını yeniden tasarlamak.
- Canlı kullanıcı parolalarını okumak, taşımak veya mağaza veritabanında saklamak.

## 4. Güvenlik Modeli

### 4.1 Kimlik ve üyelik ayrımı

Logto kimliği kullanıcının kim olduğunu, mağaza PostgreSQL üyeliği ise hangi mağazada hangi rolü taşıdığını belirler.

- Kimlik anahtarı: `(provider = 'logto', subject)`
- Mağaza yetkisi: `(principal_id, store_slug, role, status = 'active')`
- Roller: `super_admin`, `product_manager`, `content_creator`, `order_manager`
- Üyeliği olmayan veya iptal edilmiş kullanıcı erişemez.
- Teknik hata oluştuğunda sistem kapalı kalır; üyelik kontrolü atlanmaz.

### 4.2 Çoklu mağaza

Aynı Logto `subject` değeri hedef mağazaların her bir PostgreSQL veritabanında bir `auth_principals` kaydıyla temsil edilir. Her mağazada yalnızca o mağazaya ait `auth_store_memberships` kaydı bulunur. Böylece bir yönetici Hemenaku ve başka bir müşteri mağazasına atanabilirken üçüncü bir mağazaya otomatik erişim kazanmaz.

### 4.3 E-posta eşleştirme

Yeni atamalarda Owner katmanı önce Logto kimliğini çözümler ve mağaza üyeliğini doğrudan `subject` ile yazar. Callback’in normal yolu yalnızca `subject` üzerinden çalışır.

Legacy kayıtların kontrollü geçişinde e-posta ancak Logto tarafından doğrulanmışsa kullanılabilir. Doğrulanmamış e-posta üyelik bağlamak için kullanılamaz. Başarılı tek seferlik eşleştirme, sonraki girişlerin yalnızca `subject` üzerinden çalışması için kalıcı hale getirilir.

## 5. Owner Yönetici Atama Akışı

`POST /api/stores/[slug]/admins` hedef mağazanın çalışma standardına göre davranır.

### 5.1 `light_postgres + logto`

1. Owner oturumu ve hedef mağaza üzerinde işlem yetkisi doğrulanır.
2. E-posta normalize edilir.
3. Logto Management API üzerinden kimlik bulunur. Kimlik yoksa güvenli Logto davet/parola oluşturma akışı başlatılır; parola mağaza PostgreSQL veritabanına yazılmaz.
4. Hedef mağaza veritabanında `auth_principals` kaydı `(provider, subject)` anahtarıyla idempotent biçimde eklenir veya güncellenir.
5. `auth_store_memberships` kaydı `(principal_id, store_slug, role)` anahtarıyla idempotent biçimde eklenir veya güncellenir.
6. Atama sonucu Owner denetim kaydına yazılır. Ham token, parola ve uygulama sırrı loglanmaz.
7. Aynı e-posta başka bir mağazaya atanırsa yeni Logto hesabı oluşturulmaz; mevcut `subject` hedef mağazada yetkilendirilir.

### 5.2 Legacy mağazalar

Mevcut Supabase yolu değiştirilmeden korunur. Yeni Logto/PostgreSQL yolu açıkça seçilir; iki sağlayıcı arasında sessiz fallback yapılmaz.

## 6. Admin Giriş ve Callback Akışı

1. `/admin/login` mağaza adı ve mevcutsa mağaza logosunu gösterir.
2. “Güvenli giriş yap” eylemi `/api/auth/sign-in?next=/admin` üzerinden Logto OIDC akışını başlatır.
3. Normal SSO akışı, daha önce giriş yapmış ve üyeliği bulunan yöneticiyi tekrar parola sormadan ilgili panele alabilir.
4. “Başka hesapla giriş yap” eylemi OIDC isteğine `prompt=login` ekler ve hesap seçimini zorlar.
5. Callback state imzasını, authorization code’u ve hedef yolu doğrular.
6. Token değişimi ve `userinfo` çağrısı tamamlanır.
7. Geçerli `subject` için yalnızca mevcut mağazanın aktif üyeliği aranır.
8. Üyelik bulunursa mağaza alan adına özel imzalı admin oturumu oluşturulur ve güvenli `next` yoluna yönlendirilir.
9. Üyelik yoksa kullanıcıya mağazaya atanmadığı bildirilir; erişim verilmez.

## 7. Hata Sınıflandırması

Callback tüm hataları `login_failed` altında toplamayacak.

| Kod | Anlam | Kullanıcı eylemi |
| --- | --- | --- |
| `invalid_callback` | State veya code eksik/geçersiz | Girişi yeniden başlat |
| `token_exchange_failed` | Logto code/token değişimi tamamlanamadı | Tekrar dene; sürerse destek |
| `identity_lookup_failed` | Logto kullanıcı bilgisi alınamadı | Tekrar dene |
| `membership_unavailable` | Mağaza yetki veritabanına erişilemedi | Daha sonra tekrar dene |
| `not_assigned` | Kimlik geçerli, bu mağazada aktif üyelik yok | Başka hesap kullan veya mağaza sahibine başvur |
| `session_write_failed` | Güvenli admin oturumu oluşturulamadı | Girişi yeniden başlat |

Kullanıcı mesajları teknik ayrıntı veya sır içermez. Sunucu logları; korelasyon kimliği, mağaza slug’ı, aşama ve güvenli hata sınıfını içerir. Tokenlar, parolalar, cookie değerleri, uygulama secret’ları ve ham kişisel veriler loglanmaz.

## 8. Giriş Ekranı

- Ana marka müşterinin mağaza adı/logosudur; logo yoksa mağaza adı metin olarak gösterilir.
- Alt bilgi küçük “Celebix altyapısıyla korunuyor” ifadesini taşır.
- Logto sağlayıcı adını kullanıcıya teknik metin olarak açıklayan mevcut kutu kaldırılır.
- Birincil eylem “Güvenli giriş yap” olur.
- Hata banner’ı hata koduna göre anlaşılır Türkçe metin ve uygun tekrar/hesap değiştir eylemi gösterir.
- Klavye odağı, hata duyurusu, 44 pikselden küçük olmayan eylemler ve mobil taşmasız düzen zorunludur.

## 9. Test Stratejisi

### 9.1 Otomatik testler

- Aynı Logto kimliği Hemenaku ve ikinci test mağazasında aktif üyeyse ikisine de kabul edilir.
- Aynı kimlik üyeliği olmayan üçüncü mağazada reddedilir.
- İptal edilmiş üyelik reddedilir.
- Tekrarlanan yönetici ataması yeni kimlik oluşturmaz ve üyeliği idempotent günceller.
- Legacy Supabase mağaza akışı değişmeden kalır.
- Callback her hata aşamasını doğru güvenli koda dönüştürür.
- `next` parametresi yalnızca güvenli iç yol kabul eder.
- `prompt=login` yalnızca kullanıcı başka hesap seçtiğinde eklenir.
- Oturum cookie’si `HttpOnly`, `Secure`, `SameSite=Lax` ve mağaza alanına uygun olur.

### 9.2 Canlı tarayıcı doğrulaması

- Anonim Hemenaku admin girişi Logto ekranına ulaşır.
- Yetkili test yöneticisi Hemenaku `/admin` ekranına girer.
- Aynı yönetici ikinci test mağazasına girer.
- Atanmamış mağaza erişimi güvenli biçimde reddedilir.
- Yanlış hesap durumunda “Başka hesapla giriş yap” akışı çalışır.
- Çıkış sonrası admin sayfası tekrar girişe yönlendirir.
- Masaüstü ve mobil giriş sayfalarında görsel taşma ve erişilebilirlik hatası bulunmaz.

Canlı testlerde gerçek müşteri verisi değiştirilmez. Test kimliği ve test mağazası açıkça işaretlenir; test üyeliği denetim kaydıyla oluşturulur.

## 10. Dağıtım ve Geri Dönüş

1. Değişiklikler canlı Hemenaku commit’i `fc6c5318` tabanında ayrı dalda geliştirilir.
2. Auth odaklı testler ve production build geçmeden imaj yayınlanmaz.
3. Hemenaku admin uygulaması yeni imajla canary olarak dağıtılır.
4. OIDC başlangıcı, callback, `/api/admin/me`, `/admin` ve logout smoke testleri tamamlanır.
5. Başarısızlık halinde önceki çalışan `ghcr.io/celebixco/hemenaku-admin:production` imaj sürümüne Coolify rollback yapılır.
6. Hemenaku doğrulandıktan sonra ortak admin şablonuna aynı kod taşınır; mağaza başına özel yetki verisi taşınmaz.

## 11. Kabul Kriterleri

- Aynı yönetici tek Logto hesabıyla iki atanmış mağazaya girebilir.
- Atanmamış mağazaya erişemez.
- Callback teknik hataları ve yetki reddini birbirinden ayırır.
- Owner panelindeki Logto/PostgreSQL yönetici ataması Supabase bağımlılığı olmadan çalışır.
- Giriş ekranı mağaza kimliğini gösterir ve başka hesap seçimine izin verir.
- Production build başarıyla tamamlanır.
- Auth kapsamındaki yeni/değişen dosyalarda TypeScript hatası kalmaz.
- Canlı Hemenaku smoke testi başarılı olur ve sonucu kayıt altına alınır.
