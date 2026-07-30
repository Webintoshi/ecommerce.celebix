# Mağaza Markalı Yönetim Kimlik Akışı Sertleştirme Tasarımı

Tarih: 30 Temmuz 2026  
Durum: Kullanıcı tarafından yönü ve ana kararları onaylandı; uygulama planı öncesi yazılı inceleme bekleniyor.

## 1. Problem

Celebix'in yeni SaaS yönetim düzlemi merkezi Logto kimliği, PostgreSQL mağaza üyeliği ve kalıcı panel oturumları üzerine kuruludur. Kayıt sonrası tek kullanımlık panel devri ve geri dönen kullanıcı girişi için güçlü altyapı parçaları bulunmasına rağmen kullanıcı deneyimi tek bir mağaza standardı olarak tamamlanmamıştır:

- yönetim paneli giriş noktası ortak `panel.saas-staging.celebix.site` alanında genel Celebix markası gösterir;
- mağaza sözleşmesinde üretilen `/stores/<slug>` panel URL'si canlı uygulamada karşılık bulmaz;
- Güzide Kuyumcu için mağazaya özel admin hostname'i yoktur;
- legacy mağazaların ayrı admin uygulamaları ile yeni ortak customer-panel aynı kimlik akışını paylaşmaz;
- panel çıkışı ile Logto çıkışı ve bütün mağaza oturum ailesinin iptali tek kullanıcı eylemi olarak tanımlı değildir;
- kayıt, ilk oturum, çıkış ve yeniden giriş tek bir uçtan uca kabul matrisiyle korunmaz.

Bu eksiklikler, ayrı mağazalara ayrı admin uygulaması dağıtılarak çözülmeyecektir. Hedef, İKAS'ın `magazaadi.myikas.com/admin` modelindeki gibi mağazaya özel URL ve marka hissi veren fakat tek kod tabanı ve tek güvenlik otoritesi kullanan çok kiracılı bir yönetim uygulamasıdır.

## 2. Kapsam

Bu tasarım yalnız mağaza yöneticilerinin deneyimini kapsar:

1. mağaza kaydı;
2. kayıt sonrası ilk panel oturumu;
3. mağazaya özel markalı giriş;
4. çoklu mağaza değiştirme;
5. bütün Celebix yönetim oturumlarından çıkış;
6. çıkış sonrası yeniden giriş.

Vitrin son müşterilerinin üyelik, parola sıfırlama ve hesap yönetimi bu çalışmanın kapsamı dışındadır. Ödeme, sipariş ve katalog davranışları yalnız oturum/tenant sınırının korunması açısından test edilir; işlevleri yeniden tasarlanmaz.

## 3. Onaylanan ana kararlar

- Yeni standart admin URL'si `https://<store-slug>.admin.celebix.site` olacaktır.
- Staging standardı `https://<store-slug>.admin.saas-staging.celebix.site` olacaktır.
- Bütün bu hostname'ler tek customer-panel uygulamasına yönlenecektir; mağaza başına ayrı build veya deploy oluşturulmayacaktır.
- Logto kimlik otoritesi, PostgreSQL ise mağaza üyeliği ve panel oturumu otoritesi olarak kalacaktır.
- Kayıt sonrası aynı doğrulanmış kimlik ikinci kez parola girmeden yeni mağazasının paneline alınacaktır.
- Çoklu mağaza yöneticisi yalnız aktif üyeliklerini görecek ve parola girmeden mağazalar arasında geçebilecektir.
- “Çıkış” mevcut host cookie'sini temizlemekle kalmayacak; PostgreSQL'de principal'a ait bütün panel oturum ailelerini ve merkezi Logto oturumunu sonlandıracaktır.
- `admin.hemenaku.com` gibi mevcut admin alan adları mağazaya bağlı alias olarak korunacak, mağazalar kontrollü canary ile ortak panele taşınacaktır.

## 4. Mimari

### 4.1 Tek uygulama, mağaza bazlı hostname

Wildcard DNS ve TLS bir kez tanımlanır:

- production: `*.admin.celebix.site`;
- staging: `*.admin.saas-staging.celebix.site`.

Traefik/Coolify bütün eşleşen hostname'leri aynı customer-panel uygulamasına iletir. Uygulama `Host`, `Forwarded` ve `X-Forwarded-Host` değerlerini mevcut proxy otoritesi kurallarıyla doğrular. Tarayıcıdan gelen slug, query parametresi veya JSON store kimliği tenant otoritesi değildir.

### 4.2 Admin domain otoritesi

Append-only migration `202607300069` aşağıdaki kalıcı otoriteyi ekler:

```text
saas.admin_domains
  id uuid primary key
  store_id uuid references saas.stores(id)
  hostname text unique
  kind text check ('platform_subdomain', 'custom_alias')
  status text check ('pending_verification', 'active', 'disabled')
  canonical boolean
  verified_at timestamptz nullable
  created_at timestamptz
  updated_at timestamptz
```

Her aktif mağazanın tek canonical admin domain'i olur; bu kural kısmi unique index ile korunur. Custom alias yalnız doğrulanmışsa çözülür. Host çözümleme fonksiyonu yalnız aktif admin domain + aktif mağaza projeksiyonu döndürür; mağaza veritabanı bağlantısı, secret, Logto ayarı veya kullanıcı bilgisi döndürmez.

Starter tenant kurulumu canonical admin hostname'ini deterministik biçimde üretir. Tenant sonuç sözleşmesindeki `panelUrl`, ortak `/stores/<slug>` yolu yerine kesin canonical admin origin olur.

Migration `069` ayrıca mevcut panel credential'ından principal'ı bulan ve aynı principal'a ait bütün aktif session family kayıtlarını tek transaction içinde iptal eden `saas.revoke_principal_panel_sessions(...)` güvenlik fonksiyonunu ekler. Fonksiyon ham principal ID kabul etmez; çağıranın mevcut geçerli credential kanıtını sunması zorunludur.

### 4.3 Güvenli public marka projeksiyonu

Anonim giriş ekranı yalnız aşağıdaki dondurulmuş projeksiyonu alabilir:

```ts
type PublicAdminBrand = Readonly<{
  storeSlug: string;
  displayName: string;
  logoUrl: string | null;
  accentColor: string | null;
  canonicalAdminOrigin: string;
}>;
```

Logo yalnız aynı mağazanın aktif R2 storefront/admin asset kaydından üretilir. Harici kullanıcı URL'si, object key, store UUID, iletişim verisi, veritabanı bilgisi veya auth sağlayıcı secret'ı public yanıta girmez.

## 5. Kimlik ve oturum akışları

### 5.1 Kayıt ve ilk oturum

1. Kullanıcı `https://ecommerce.celebix.co/kayit` formunda mağaza adını ve slug'ını gönderir.
2. Owner katmanı kaydı doğrular, OIDC transaction/state/nonce/PKCE kayıtlarını PostgreSQL'e yazar ve Logto'ya yönlendirir.
3. Merkezi callback; issuer, audience, nonce, code verifier, doğrulanmış e-posta ve tek kullanımlık state'i doğrular.
4. Starter tenant, mağaza üyeliği ve canonical admin domain'i tek idempotent operasyonla oluşturulur.
5. Owner mevcut tek kullanımlık panel handoff kaydını canonical admin origin'e bağlar.
6. Merkezi callback, kısa ömürlü handoff kanıtını URL'ye yazmadan, sıkı CSP'li tek kullanımlık bir HTML formuyla `<slug>.admin.celebix.site/auth/handoff` adresine top-level POST eder.
7. Customer-panel handoff'u bir kez kullanır, PostgreSQL panel session credential'ını oluşturur ve host-only cookie yazar.
8. Kullanıcı ikinci kez parola girmeden yeni mağazasının panel ana sayfasına girer.

Kayıt tamamlanıp session yazımı belirsiz kalırsa tenant tekrar oluşturulmaz. Mevcut operation recovery sonucu kullanılır ve güvenli şekilde yeni bir handoff üretilir.

### 5.2 Geri dönen yönetici girişi

1. Anonim kullanıcı mağazanın admin hostname'ini açar.
2. Sunucu hostname'i `saas.admin_domains` üzerinden çözer ve markalı giriş ekranını sunar.
3. Giriş eylemi merkezi Logto authorization akışını başlatır; callback URL merkezi ve sabittir.
4. Callback yalnız Logto `issuer + subject` kimliğini kabul eder; e-posta callback yetki anahtarı değildir.
5. PostgreSQL, principal'ın hedef mağazada aktif üyeliği olduğunu doğrular.
6. Tek kullanımlık cross-origin handoff hedef mağaza admin hostuna döner ve host-only panel cookie'si oluşturur.

Üyelik yoksa session ve handoff oluşturulmaz. Kullanıcı markalı sayfada “Bu mağazaya erişim yetkiniz yok” mesajı ve “Başka hesapla giriş yap” eylemi görür.

### 5.3 Mağaza değiştirme

Panel, mevcut principal için aktif üyelikleri sunucu tarafında listeler:

- sıfır üyelik: oturum iptal edilir ve erişim reddedilir;
- tek üyelik: mağaza seçici gösterilmez;
- birden fazla üyelik: mağaza seçici yalnız public mağaza adı/logo/admin origin projeksiyonunu gösterir.

Hedef mağaza seçimi POST + origin/CSRF doğrulamasıyla yapılır. Sunucu üyeliği yeniden doğrular, tek kullanımlık mağazalar arası handoff üretir ve sıkı CSP'li top-level POST formunu hedef admin hostuna gönderir. Hedef host kendi host-only cookie'sini yazar. Ortak `.admin.celebix.site` domain cookie'si kullanılmaz.

### 5.4 Global çıkış

“Çıkış” aşağıdaki sırayla çalışır:

1. yalnız same-origin POST kabul edilir;
2. panel credential doğrulanır;
3. PostgreSQL, mevcut credential'dan principal'ı çözen `revoke_principal_panel_sessions` fonksiyonuyla bu principal'a ait bütün aktif panel session family kayıtlarını iptal eder;
4. mevcut host cookie'si `Max-Age=0` ile temizlenir;
5. tarayıcı Logto'nun doğrulanmış `end_session_endpoint` adresine yönlendirilir;
6. Logto yalnız önceden kayıtlı sabit Celebix panel logout callback authority'sine döner (`https://panel.celebix.site/auth/logout/callback`; staging karşılığı `https://panel.saas-staging.celebix.site/auth/logout/callback`);
7. callback imzalı ve izinli admin-domain dönüş hedefini çözer;
8. kullanıcı markalı giriş ekranında “Güvenli çıkış tamamlandı” durumunu görür.

Başka mağaza hostunda eski cookie tarayıcıda kalsa bile PostgreSQL principal oturum iptali nedeniyle ilk sunucu isteğinde 401 alır ve cookie temizlenir. Böylece ayrı zamanlarda oluşmuş birden fazla session family de global çıkıştan sonra kullanılamaz.

### 5.5 Başka hesapla giriş

“Başka hesapla giriş yap” global logout değildir. Giriş başlangıcına server-owned `prompt=login` kararı taşır; kullanıcı tarafından verilen keyfi OIDC parametreleri kabul edilmez. Mevcut panel oturumu ancak yeni kimliğin üyeliği doğrulanıp yeni session güvenle yazıldıktan sonra değiştirilir.

## 6. Cookie, token ve yönlendirme kuralları

- Panel cookie adı `__Host-` önekli, host-only, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` olacaktır.
- Handoff credential URL, fragment, browser storage veya referrer'a yazılmayacaktır. Yalnız exact-origin kontrollü, boyutu sınırlı, top-level POST form body içinde taşınacak; hedef `/auth/handoff` GET isteklerini 405 ile reddedecektir.
- Authorization code, access token, ID token, cookie değeri, DB URL'si ve imza anahtarı loglanmayacaktır.
- `returnTo` yalnız aynı admin origin'deki izinli internal panel yollarından seçilecektir.
- Callback, login ve logout yanıtları `Cache-Control: no-store`, `Referrer-Policy: no-referrer` ve `X-Content-Type-Options: nosniff` taşıyacaktır.
- Session issuance, rotation, store switch ve logout idempotent operasyon kimliğiyle çalışacaktır.
- Replay edilmiş state, browser binding veya handoff fail-closed olur.

## 7. Kullanıcı deneyimi

### 7.1 Markalı giriş ekranı

- mağaza logosu veya güvenli monogram;
- mağaza adı ve “Yönetim Paneli” başlığı;
- birincil “Güvenli giriş yap” eylemi;
- ikincil “Başka hesapla giriş yap” eylemi;
- küçük “Celebix altyapısıyla korunuyor” güven satırı;
- 44 pikselden küçük olmayan hedefler, klavye odağı, `role=alert` hata duyurusu ve mobil taşmasız düzen.

### 7.2 Panel üst alanı

Aktif mağaza adı/logo her sayfada sabit görünür. Çoklu üyeliği olanlarda erişilebilir mağaza değiştirici açılır. “Mağaza değiştir” ve “Çıkış” birbirinden ayrı eylemlerdir.

### 7.3 Güvenli hata sözleşmesi

| Kod | HTTP | Kullanıcı mesajı | Eylem |
| --- | ---: | --- | --- |
| `admin_host_unknown` | 404 | Bu yönetim adresi bulunamadı. | Celebix ana girişine dön |
| `store_inactive` | 404 | Bu mağaza yönetim erişimine kapalı. | Destek bağlantısı |
| `not_assigned` | 403 | Bu mağazaya erişim yetkiniz yok. | Başka hesapla giriş yap |
| `session_expired` | 401 | Oturumunuzun süresi doldu. | Yeniden giriş yap |
| `handoff_replayed` | 409 | Bu giriş bağlantısı daha önce kullanıldı. | Yeni giriş başlat |
| `identity_unavailable` | 503 | Kimlik hizmetine geçici olarak ulaşılamıyor. | Tekrar dene |
| `membership_unavailable` | 503 | Mağaza yetkisi şu anda doğrulanamıyor. | Tekrar dene |
| `logout_retry_required` | 503 | Güvenli çıkış tamamlanamadı. | Çıkışı yeniden dene |

Ham query değeri veya exception metni UI'a basılmaz. Hatalar güvenli korelasyon kimliğiyle gözlemlenir.

## 8. Legacy ve custom admin alan adları

`admin.hemenaku.com` gibi mevcut alan adları `saas.admin_domains(kind='custom_alias')` kaydıyla ilgili mağazaya bağlanır. Alias aktif ve doğrulanmış değilse tenant çözülmez.

Geçiş sırası:

1. mevcut admin uygulamasının commit, imaj digest ve sağlık kanıtı kaydedilir;
2. alias ortak customer-panel canary uygulamasına yönlendirilir;
3. markalı login, üyelik, panel ana sayfası, logout ve yeniden login doğrulanır;
4. hata varsa DNS/router önceki uygulamaya döndürülür;
5. başarı kanıtlandıktan sonra mağazaya özel eski admin deploy arşivlenir.

Legacy Supabase mağazaları sessizce PostgreSQL/Logto standardına geçirilmez. Yalnız `light_postgres + logto` ve yeni shared SaaS tenantları bu akışı kullanır; legacy mağaza için açık migration gate gerekir.

## 9. Test stratejisi

### 9.1 Otomatik testler

- admin hostname exact çözümleme, büyük/küçük harf canonicalization ve spoofed forwarded-host reddi;
- kayıt → tenant → canonical admin domain → handoff → session zinciri;
- aynı principal için iki aktif mağaza kabulü ve üçüncü mağaza reddi;
- iptal edilmiş üyelik, arşivli mağaza ve disabled alias reddi;
- state, nonce, PKCE, handoff ve session replay reddi;
- güvenli olmayan `returnTo` ve custom OIDC parametre reddi;
- host-only cookie özellikleri;
- session fixation önlemek için başarılı login ve store switch sırasında credential rotation;
- global logout'un principal'a ait bütün aktif session family kayıtlarını iptal etmesi;
- ikinci logout çağrısının güvenli ve idempotent olması;
- PostgreSQL commit-unknown recovery;
- public marka projeksiyonunda secret ve çapraz mağaza asset'i bulunmaması;
- legacy mağaza route politikasının değişmeden kalması.

Testler gerçek PostgreSQL 16 disposable veritabanında migration, rollback ve reapply kanıtı üretir. Dış Logto ağı testlerde provider portunun gerçek sözleşmesini taklit eden sınırlı transport ile izole edilir; yetki ve session davranışı mock UI üzerinden değil gerçek route/service kodundan doğrulanır.

### 9.2 Tarayıcı kabul matrisi

Güzide staging pilotunda:

1. yeni kayıt kullanıcıyı doğrudan Güzide admin paneline alır;
2. anonim kullanıcı Güzide markalı giriş ekranını görür;
3. yetkili kullanıcı giriş yapar;
4. aynı kullanıcı ikinci atanmış test mağazasına geçer;
5. aynı kullanıcı atanmamış mağazada 403 alır;
6. global çıkıştan sonra eski Güzide ve ikinci mağaza sekmeleri 401 alır;
7. yeniden giriş yeni session family ile başarılı olur;
8. desktop ve mobile görünümler taşma olmadan çalışır.

Hemenaku canary aynı matrisi `admin.hemenaku.com` custom alias'ı üzerinde doğrular. Gerçek müşteri parolası, siparişi veya ödeme verisi testte kullanılmaz.

## 10. Dağıtım ve geri dönüş

1. Güzide staging entegrasyon dalı, kategori vitrini ve returning-login commitlerini içeren temiz bir auth entegrasyon worktree'sinde birleştirilir.
2. Migration `069` disposable PostgreSQL kanıtları geçmeden staging veritabanına uygulanmaz.
3. Wildcard DNS/TLS ve router hedefi sağlık kontrolüyle doğrulanır.
4. Customer-panel staging deploy edilir ve Güzide canonical admin domain kaydı oluşturulur.
5. Tam tarayıcı matrisi geçerse Hemenaku alias canary yapılır.
6. Production açılışı mağaza grupları halinde ilerler; yeni mağaza provisioning'i canonical admin domain üretmeden `ready` durumuna geçmez.
7. Uygulama hatasında önceki image digest'e, domain routing hatasında önceki router hedefine dönülür.
8. Migration geri dönüşü yalnız yeni admin domain/handoff kayıtları kullanımda değilse uygulanır; session otoritesi zayıflatılarak rollback yapılmaz.

## 11. Kabul kriterleri

- Her yeni mağaza tek shared uygulamaya bağlı mağazaya özel admin hostname'i alır.
- Güzide markalı admin giriş ekranı canonical staging hostname'inde açılır.
- Kayıt sonrası ikinci parola istemeden güvenli ilk panel oturumu oluşur.
- Giriş, global çıkış ve yeniden giriş akışı otomatik ve tarayıcı testlerinde geçer.
- Aynı kimlik iki atanmış mağazaya erişir, atanmamış mağazaya erişemez.
- Global çıkış principal'a ait bütün store-host session family kayıtlarını geçersiz kılar.
- Callback veya handoff replay erişim vermez ve yönlendirme döngüsü oluşturmaz.
- `admin.hemenaku.com` alias'ı ayrı admin kod tabanı gerektirmeden çalışır.
- Unit, route, PostgreSQL 16, typecheck ve production build kontrolleri geçer.
- Canlı/staging kabul kanıtı commit SHA, image digest, migration manifest ve tarayıcı sonuçlarıyla kaydedilir.

## 12. Referans davranış

- İKAS mağaza adını `magazaadi.myikas.com/admin` yönetim URL'sine bağlar: https://support.ikas.com/tr/magaza-ayarlari
- İKAS personel hesaplarını erişim izinleri ve satış kanalı izinleriyle sınırlar: https://support.ikas.com/tr/personeller

Bu referans yalnız kullanıcı deneyimi ve URL modelini doğrular. Celebix'in kimlik, cookie, session family, PostgreSQL RLS ve callback güvenliği kendi otorite modeline göre uygulanacaktır.
