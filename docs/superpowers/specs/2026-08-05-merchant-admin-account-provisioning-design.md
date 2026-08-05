# Mağaza Yönetici Hesabı Oluşturma Tasarımı

Tarih: 5 Ağustos 2026
Durum: Kullanıcı tarafından yazılı olarak onaylandı; uygulama planı öncesi spesifikasyon incelemesi bekleniyor.

## 1. Problem

Customer-panel içindeki `/settings/administrators` ekranı bugün gerçek bir yönetici hesabı oluşturmamaktadır. Ekran, `administrator_invite` türünde genel bir merchant-admin kaydı yazmaktadır. Bu kayıt:

- Logto kullanıcısı oluşturmaz;
- `saas.principals` kimliği oluşturmaz veya bağlamaz;
- `saas.memberships` üzerinden mağaza erişimi vermez;
- giriş bilgisi üretmez;
- mevcut panel oturumlarını iptal edemez;
- gerçek yönetici listesi veya rol otoritesi değildir.

Giriş başlangıcı, OIDC callback'i, kalıcı panel session'ı ve çıkış mekanizması gerçektir. Eksik olan parça, mağaza sahibinin panelden yeni bir çalışan hesabı oluşturup giriş bilgilerini güvenli biçimde kendisine teslim edebilmesidir.

## 2. Amaçlar

Bu çalışma aşağıdaki yetenekleri ekleyecektir:

1. Yetkili mağaza sahibi veya yönetici, customer-panel üzerinden çalışan hesabı oluşturabilir.
2. Sistem güçlü bir geçici parola üretir; davet e-postası gönderilmez.
3. Kullanıcı Logto'da oluşturulur veya mevcut Logto kimliğine güvenli biçimde bağlanır.
4. Erişim otoritesi PostgreSQL'deki aktif mağaza üyeliği olur.
5. Geçici parola yalnız bir kez, başarılı sonuç ekranında gösterilir.
6. Mağaza sahibi giriş bilgilerini kullanıcıya kendi seçtiği güvenli kanaldan teslim eder.
7. Rol değişikliği ve erişim iptali kalıcı üyelik otoritesinden yapılır.
8. İptal edilen kullanıcının hedef mağazadaki panel erişimi ve ilgili panel oturumları fail-closed sona erer.
9. Mevcut Logto giriş, callback ve logout akışları yeniden kullanılmaya devam eder.

## 3. Kapsam dışı

- Davet, parola veya bildirim e-postası gönderimi.
- Celebix içinde yerel parola tablosu veya özel kimlik sağlayıcı oluşturulması.
- Logto yerine ikinci bir giriş sistemi kurulması.
- Mağaza sahibi aktarımı veya silinmesi.
- Üretim aktivasyonu, production credential değişikliği, deploy veya merge.
- Global Logto kullanıcısının silinmesi.
- MFA faktörlerinin yönetici tarafından kurulması veya atlanması.
- Browser'dan store ID, tenant ID, principal ID veya üyelik otoritesi kabul edilmesi.

## 4. Otorite modeli

Kimlik ve erişim farklı otoritelerde kalır:

| Sorumluluk | Tek otorite |
| --- | --- |
| Kullanıcı adı, parola ve OIDC subject | Logto |
| Celebix principal kimliği | `saas.principals` |
| Mağaza erişimi ve rol | `saas.memberships` |
| Aktif mağaza ve panel session | PostgreSQL panel session tabloları |
| İstek yapan mağaza | Host çözümlemesi + server-side `TenantContext` |
| Yönetici işleminin faili | Doğrulanmış panel credential'ından çözülen principal/membership |

`administrator_invite` kayıtları erişim otoritesi sayılmaz. Yeni ekran yalnız gerçek principal + üyelik projeksiyonunu gösterir. Eski genel kayıtlar silinmez fakat yeni hesap oluşturma akışında okunmaz veya yazılmaz.

## 5. Rol ve yetki kuralları

Mevcut roller korunur: `store_owner`, `admin`, `editor`, `analyst`.

- `store_owner`, aynı mağazada `admin`, `editor` ve `analyst` oluşturabilir, rollerini değiştirebilir ve erişimlerini iptal edebilir.
- `admin`, yalnız `editor` ve `analyst` oluşturabilir, bu iki rol arasında değişiklik yapabilir ve erişimlerini iptal edebilir.
- `admin`, başka bir kullanıcıya `admin` veya `store_owner` veremez.
- `editor` ve `analyst` hesap yönetemez.
- Hiçbir kullanıcı kendi rolünü yükseltemez veya kendi erişimini bu ekran üzerinden iptal edemez.
- Son aktif `store_owner` iptal edilemez veya daha düşük role indirilemez.
- Hedef üyelik, istek yapan üyelikle aynı `store_id` içinde değilse işlem repository çağrısına ulaşmadan reddedilir.
- Yeni aktif üyelik, committed tenant snapshot'ındaki effective `limits.staff` değerini aşamaz. Rezervasyon ve finalization bu limiti aynı store lock altında yeniden kontrol eder.

Bu kurallar hem UI görünürlüğünde hem server handler'da hem de PostgreSQL fonksiyonlarında ayrı ayrı uygulanır. UI gizleme tek başına güvenlik kontrolü değildir.

Hesap yönetimi genel `configuration.manage` iznine bağlanmaz. Dedicated repository/SQL authority matrisi `administrators.read` ve `administrators.manage` kararlarını yukarıdaki rol kurallarına göre verir; böylece başka bir ayarı değiştirebilmek kullanıcı rolü yükseltme yetkisi sağlamaz.

## 6. Kullanıcı deneyimi

### 6.1 Yönetici listesi

`/settings/administrators` ekranı aşağıdaki gerçek üyelik alanlarını gösterir:

- ad;
- kullanıcı adı;
- normalize e-posta;
- rol;
- üyelik durumu;
- oluşturulma ve son rol değişikliği zamanı.

Ekran ayrıca effective staff limitini ve kullanılan aktif üyelik sayısını gösterir. Limit doluysa oluşturma eylemi kontrollü olarak devre dışı kalır; UI plan yükseltme gereksinimini açıklar fakat limiti aşan isteği yine server ve PostgreSQL reddeder.

Sağlayıcı token'ı, Logto iç kimliği, principal UUID'si, membership UUID'si ve session credential browser'a gönderilmez. “Son giriş” ancak kalıcı, güvenilir bir server projeksiyonu mevcutsa gösterilir; tahmini veya sahte değer üretilmez.

### 6.2 Hesap oluşturma

Form alanları:

```ts
type CreateMerchantAdministratorInput = Readonly<{
  displayName: string;
  username: string;
  email: string;
  role: "admin" | "editor" | "analyst";
  idempotencyKey: string;
}>;
```

Sunucu:

- adı, kullanıcı adını ve e-postayı trim sonrası exact canonical kurallarla doğrular;
- kullanıcı adını Logto tenant genelinde benzersiz kabul eder;
- e-postayı mevcut Celebix normalizasyon kuralıyla eşler;
- rolü istek yapan üyeliğin yetki matrisine göre sınırlar;
- parolayı browser'dan kabul etmez;
- 24 rastgele byte'tan base64url ile en az 32 karakterlik, kriptografik olarak güçlü geçici parola üretir.

Başarılı yeni hesap sonucunda yalnız bir kez şu model döner:

```ts
type CreatedMerchantAdministratorCredential = Readonly<{
  outcome: "created";
  displayName: string;
  username: string;
  temporaryPassword: string;
  role: "admin" | "editor" | "analyst";
}>;
```

Sonuç dialog'u kullanıcı adını ve geçici parolayı ayrı ayrı kopyalatır, sayfa kapandığında tekrar gösterilemeyeceğini açıkça belirtir ve browser storage kullanmaz. Yanıt `Cache-Control: no-store`, `Pragma: no-cache` ve `Referrer-Policy: no-referrer` taşır.

### 6.3 Mevcut hesap

Exact normalize e-postaya veya kullanıcı adına karşılık gelen Logto kullanıcısı zaten varsa sistem parola değiştirmez ve parola göstermez. Yalnız sağlayıcı subject'i ile mevcut `saas.principals` bağını doğrular ve mağaza üyeliği ekler.

```ts
type ExistingMerchantAdministratorResult = Readonly<{
  outcome: "membership_added";
  displayName: string;
  username: string;
  role: "admin" | "editor" | "analyst";
}>;
```

Kullanıcı zaten aynı mağazada aktif üyeyse idempotent `already_active` sonucu döner. Aynı e-posta ve kullanıcı adı farklı Logto subject'lerine işaret ediyorsa sistem otomatik birleştirme yapmaz; güvenli çakışma hatası verir.

### 6.4 Geçici parolayı yenileme

İlk yanıt kaybolduğunda eski parola hiçbir depodan geri okunamaz. Yetkili kullanıcı ayrı “Geçici parolayı yenile” işlemi başlatabilir. Bu işlem:

1. yeni güçlü parola üretir;
2. exact Logto subject için parolayı Management API üzerinden değiştirir;
3. hedef kullanıcının aktif Logto grant/session'larını ve Celebix panel session'larını iptal eder;
4. yeni parolayı yalnız aynı başarılı yanıtta bir kez gösterir.

Mevcut kullanıcıya mağaza üyeliği eklenmişse bu eylem varsayılan olarak sunulmaz; başka mağazalarda kullanılan hesabın parolasını sessizce değiştirmek yasaktır.

## 7. Logto Management API adaptörü

Yeni adaptör yalnız server tarafında çalışır ve minimum Management API yetkileriyle ayrı bir M2M uygulaması kullanır. Uygulama secret'ı React, RSC payload, browser bundle, hata mesajı veya loglara girmez.

Adaptör şu işlemleri kapsar:

```ts
interface MerchantIdentityProvisioner {
  findUserByExactIdentifiers(input: Readonly<{
    username: string;
    normalizedEmail: string;
  }>): Promise<Readonly<{ kind: "missing" }> | ProvisionedIdentity>;

  createUser(input: Readonly<{
    displayName: string;
    username: string;
    normalizedEmail: string;
    temporaryPassword: string;
  }>): Promise<ProvisionedIdentity>;

  replacePassword(input: Readonly<{
    providerSubject: string;
    temporaryPassword: string;
  }>): Promise<void>;

  revokeUserSessions(providerSubject: string): Promise<void>;
}

type ProvisionedIdentity = Readonly<{
  providerSubject: string;
  username: string;
  normalizedEmail: string;
  displayName: string;
}>;
```

HTTP kuralları:

- issuer ve Management API origin'i immutable staging/production authority profile'dan gelir;
- yalnız HTTPS, exact origin ve izinli exact endpoint'ler kullanılır;
- redirect modu `manual` kalır ve 3xx reddedilir;
- bağlantı ve body timeout'ları uygulanır;
- response body ve key sayıları sınırlandırılır;
- yalnız endpoint'in beklediği exact JSON media type kabul edilir;
- hata sınıflandırması sabit ve secretsiz olur;
- access token bellek dışında saklanmaz; loglanmaz ve yanıta girmez.

Resmi create-user sözleşmesi `primaryEmail`, `username` ve `password` kabul eder; ancak çağıranın `email_verified` değeri uydurmasına izin vermez. Bu nedenle uygulama önkoşulu, disposable staging kullanıcısının normal OIDC girişi sonunda mevcut provider sözleşmesinin zorunlu tuttuğu `email_verified === true` iddiasını üretmesinin kanıtlanmasıdır. Kanıt alınamazsa callback doğrulaması gevşetilmeyecek, e-posta doğrulanmış kabul edilmeyecek ve uygulama `MERCHANT_ADMIN_VERIFIED_EMAIL_AUTHORITY_BLOCKED` ile duracaktır.

Referanslar:

- Logto Management API kullanıcı oluşturma: <https://openapi.logto.io/dev/operation/operation-createuser>
- Logto kullanıcı yönetimi: <https://docs.logto.io/user-management/manage-users>
- Public kayıt kapalı kullanıcı oluşturma modeli: <https://docs.logto.io/end-user-flows/sign-up-and-sign-in/disable-user-registration>
- Logto parola politikası: <https://docs.logto.io/security/password-policy>

## 8. Kalıcı veri modeli

Bir sonraki append-only migration sürümü, uygulama planı hazırlanırken branch'in en yüksek migration sürümünden tekrar doğrulanacaktır. Mevcut tasarım tabanında aday sürüm `202608050087`'dir.

Yeni tablo parola saklamaz:

```text
saas.merchant_admin_provisioning_operations
  id uuid primary key
  store_id uuid not null references saas.stores(id)
  requested_by_membership_id uuid not null references saas.memberships(id)
  idempotency_key text not null
  payload_fingerprint text not null
  normalized_email text not null
  username text not null
  requested_role text not null
  status text not null
    check ('reserved', 'provider_created', 'committed',
           'known_failed', 'reconciliation_required')
  provider_subject text null
  principal_id uuid null references saas.principals(id)
  membership_id uuid null references saas.memberships(id)
  created_at timestamptz not null
  updated_at timestamptz not null
  committed_at timestamptz null
```

Zorunlu kısıtlar:

- `(store_id, idempotency_key)` unique;
- aynı idempotency key farklı payload fingerprint ile tekrar kullanılamaz;
- email, username ve role canonical check'leri;
- `committed` durumda provider subject, principal, membership ve committed timestamp zorunlu;
- parola, access token, client secret, cookie, authorization code veya ham idempotency payload kolonu bulunmaz;
- RLS ve function authority mevcut SaaS app/identity rol sınırlarına uyar.

Asıl erişim otoritesi yine `saas.memberships` olur. Provisioning tablosu yalnız dış sağlayıcı + PostgreSQL saga'sının idempotency ve recovery kanıtıdır.

Audit olayları yalnız güvenli kimlikler ve durumları içerir:

- `merchant_administrator_created`;
- `merchant_administrator_membership_added`;
- `merchant_administrator_role_changed`;
- `merchant_administrator_access_revoked`;
- `merchant_administrator_password_rotated`;
- `merchant_administrator_reconciliation_required`.

## 9. Provisioning saga ve belirsizlik semantiği

### 9.1 Yeni kullanıcı

1. PostgreSQL operation'ı store lock altında `reserved` eder.
2. Parola yalnız request belleğinde üretilir.
3. Logto exact identifier lookup yapılır.
4. Kullanıcı yoksa create-user çağrısı yapılır.
5. Provider subject döndüğünde operation `provider_created` olarak kaydedilir.
6. Tek PostgreSQL transaction'ında principal bağı, membership ve operation `committed` sonucu yazılır.
7. Commit kesinleştiğinde geçici parola aynı request'in one-time yanıtına eklenir.

### 9.2 Sağlayıcı sonucu belirsizliği

Create çağrısı timeout/connection-loss nedeniyle belirsizse otomatik ikinci create çağrısı yapılmaz. Yalnız bir read-only exact identifier lookup yapılır:

- exact tek kullanıcı bulunur ve alanları eşleşirse saga devam eder;
- kullanıcı bulunamaz fakat ilk write'ın kesin başarısızlığı kanıtlanamazsa operation `reconciliation_required` olur;
- çakışan veya birden fazla kullanıcı bulunursa fail-closed olur.

İşlem sonucu kanıtlanmadan credential gösterilmez ve üyelik oluşturulmaz.

### 9.3 PostgreSQL commit belirsizliği

Finalization commit'i belirsizse aynı operation ID ile yalnız read-only recovery yapılır. Committed satır exact principal/membership/role/store sonucu ile bulunursa mevcut request belleğindeki parola bir kez dönebilir. Süreç çöktükten sonra yapılan retry eski parolayı geri döndüremez; `already_committed_without_reveal` sonucu verir ve kullanıcı ayrı parola yenileme akışını kullanır.

### 9.4 Rollback ve telafi

Logto kullanıcısı oluşmuş fakat üyelik kesin olarak oluşmamışsa kullanıcı otomatik silinmez; sağlayıcı hesabını silmek başka mağaza erişimini bozabilir. Operation reconciliation kuyruğunda kalır. Yetkili, secretsiz audit bilgisiyle tekrar kontrol eder. Bilinmeyen sonucu ikinci write ile “düzeltmek” yasaktır.

## 10. Repository ve HTTP sınırları

Repository sözleşmesi browser'dan store/principal/membership ID almaz:

```ts
interface MerchantAdministratorRepository {
  listForTenant(context: TenantContext): Promise<readonly MerchantAdministrator[]>;
  reserveProvisioning(
    context: TenantContext,
    actor: PanelActor,
    input: CanonicalCreateMerchantAdministratorInput,
  ): Promise<ProvisioningReservation>;
  finalizeProvisioning(
    reservation: ProvisioningReservation,
    identity: ProvisionedIdentity,
  ): Promise<CommittedAdministratorMembership>;
  changeRole(
    context: TenantContext,
    actor: PanelActor,
    target: MerchantAdministratorTarget,
    role: "admin" | "editor" | "analyst",
  ): Promise<CommittedAdministratorMembership>;
  revokeAccess(
    context: TenantContext,
    actor: PanelActor,
    target: MerchantAdministratorTarget,
  ): Promise<void>;
}
```

Dedicated endpoint ailesi:

```text
GET    /api/settings/administrators
POST   /api/settings/administrators
PATCH  /api/settings/administrators/:opaqueTarget/role
POST   /api/settings/administrators/:opaqueTarget/revoke
POST   /api/settings/administrators/:opaqueTarget/reset-temporary-password
```

Mutasyonlar yalnız:

- geçerli host-only panel cookie;
- exact same-origin `Origin`;
- exact method/path;
- JSON content type ve bounded body;
- server-side TenantContext;
- server-side actor membership;
- idempotency key

ile kabul edilir. `Host`, `Forwarded` veya `X-Forwarded-*` kimlik kanıtı değildir; yalnız mevcut güvenilir public-host resolver sınırında kullanılır. Cookie dışındaki `Authorization`, `X-Celebix-*`, query store ID ve body tenant ID reddedilir.

## 11. Rol değişikliği, iptal ve session davranışı

- Rol değişikliği PostgreSQL'de row lock altında mevcut actor ve target üyeliklerini yeniden doğrular.
- Üyelikte optimistic concurrency için mevcut `updated_at` veya eklenecek `version` alanı kullanılır; stale UI yazımı reddedilir.
- Erişim iptali üyeliği `revoked` yapar; satırı silmez.
- Aynı transaction hedef mağazaya bağlı aktif panel session family kayıtlarını iptal eder.
- Başka mağazadaki aktif üyelikler korunur.
- İptal edilmiş üyelikle mağaza seçimi, session rotation veya server access resolution başarısız olur.
- Global Logto kullanıcı hesabı yalnız bu mağazadan çıkarıldığı için silinmez veya suspend edilmez.
- Parola yenileme bütün sağlayıcı session/grant'larını iptal ettiği için kullanıcı diğer mağazalarda da tekrar giriş yapmak zorunda kalabilir; UI bu etkiyi onay öncesinde açıkça gösterir.

## 12. Güvenlik ve gizlilik kuralları

- Geçici parola hiçbir DB kolonuna, audit olayına, exception'a, telemetry'ye veya snapshot'a yazılmaz.
- One-time credential model'i RSC props, query string, URL fragment, cookie veya browser storage'a girmez.
- UI, one-time dialog kapandıktan sonra state'i sıfırlar.
- Clipboard kopyalama yalnız açık kullanıcı eylemiyle yapılır.
- Liste endpoint'i parola durumu veya parola hash'i döndürmez.
- Logto access token ve M2M secret yalnız server belleğinde kalır.
- Her provider ve DB sonucu sabit, güvenli hata koduna çevrilir.
- Normalized email loglanmaz; gerekiyorsa geri döndürülemez bounded fingerprint kullanılır.
- Username ve display name UI'de output encoding ile gösterilir.
- Response body, request body ve provider body boyut sınırları uygulanır.
- Default ve production runtime bu özellik için fail-closed `disabled` kalır; pozitif aktivasyon ayrı staging authority profile gerektirir.

## 13. Test stratejisi

### 13.1 Unit ve in-process testler

- username/email/display-name canonicalization;
- rol yetki matrisi;
- CSPRNG parola uzunluğu ve formatı;
- one-time response ve no-store header'ları;
- yanlış/missing Origin, cookie, method, path ve content type;
- body/query/header ile tenant/store/principal forgery;
- owner/admin/editor/analyst pozitif ve negatif matris;
- son owner koruması;
- existing-user ve identifier collision davranışı;
- provider known failure, timeout, malformed JSON, redirect ve oversized body;
- provider unknown sonrası yalnız bir read-only recovery;
- commit_unknown sonrası yalnız read-only DB recovery;
- staff limit doluyken provider çağrısının hiç yapılmaması;
- hiçbir hata yolunda parola veya token sızıntısı olmaması;
- UI credential dialog'unun tekrar açılmaması;
- eski `administrator_invite` kaydının erişim vermemesi.

### 13.2 Disposable PostgreSQL 16 harness

- migration apply, manifest checksum ve catalog assertion;
- rollback ve reapply;
- iki eşzamanlı create isteğinde tek operation ve tek membership;
- idempotency key/payload mismatch reddi;
- exact store isolation ve cross-store target reddi;
- effective `limits.staff` yarışında iki eşzamanlı isteğin limiti aşamaması;
- actor/target row-lock rol yarışları;
- last-owner downgrade/revoke reddi;
- membership revoke sonrası session ve resolver reddi;
- başka mağaza üyeliğinin korunması;
- app/identity role privilege ve RLS negatif testleri;
- provisioning tablosunda secret/password benzeri kolon bulunmaması;
- backup/restore sonrası committed operation recovery;
- cleanup sonrası disposable cluster ve geçici dosya kalmaması.

### 13.3 Workspace regresyonları

- customer-panel test, typecheck ve build;
- Owner test, typecheck ve build;
- mevcut panel auth, route-mount, session-completion ve staging-runtime suiteleri;
- mevcut PostgreSQL composition ve session-completion harness'ları;
- `git diff --check`;
- tracked diff secret/credential/forbidden-ID scan;
- browser bundle'da Logto Management API veya M2M secret izi olmaması.

### 13.4 Ayrı staging kabul kapısı

Uygulama ve yerel doğrulama bittikten sonra ayrı yazılı yetkiyle:

1. exact SHA yalnız isolated staging customer-panel/Owner servislerine deploy edilir;
2. disposable bir çalışan hesabı oluşturulur;
3. credential durumu yalnız `created / used / revoked` olarak raporlanır;
4. kullanıcı mağazaya giriş yapar, doğru rol sınırları doğrulanır;
5. rol değişikliği ve erişim iptali canlı olarak doğrulanır;
6. iptal sonrası cookie/session tekrarları reddedilir;
7. disposable hesap ve staging credential'ları iptal edilir;
8. production etkisi `0` olarak kanıtlanır.

## 14. Uygulama sırası

1. Logto disposable staging preflight ve `email_verified` kanıtı.
2. Append-only migration, manifest ve PostgreSQL harness.
3. Server-only Logto Management API adaptörü.
4. Provisioning saga/repository ve unit testleri.
5. Dedicated HTTP authority ve route testleri.
6. Gerçek administrators UI, one-time credential dialog'u ve erişilebilirlik testleri.
7. Rol değiştirme, erişim iptali ve session revoke testleri.
8. Tam regresyon, security scan ve whole-branch review.
9. Ayrı yetkili isolated staging kabul kapısı.

Her adım red/green TDD ile küçük, bağımsız incelenebilir commit'lere ayrılacaktır. Uygulama planı exact dosyaları, satır aralıklarını, test komutlarını ve commit sınırlarını ayrıca belirleyecektir.

## 15. Başarı ölçütleri

Çalışma ancak aşağıdakilerin tamamı kanıtlandığında kapanır:

- yeni kullanıcı gerçek Logto hesabıyla giriş yapabilir;
- exact mağazada doğru PostgreSQL üyeliğine sahiptir;
- başka mağazaya erişemez;
- geçici parola yalnız bir kez gösterilir ve hiçbir kalıcı/log kaydında bulunmaz;
- mevcut kullanıcı eklenirken parolası değiştirilmez;
- rol yükseltme kuralları server ve DB seviyesinde korunur;
- erişim iptali hedef mağazadaki session erişimini sonlandırır;
- mevcut login/callback/logout davranışı bozulmaz;
- genel `administrator_invite` kayıtları hiçbir erişim sağlamaz;
- disposable PostgreSQL ve tüm workspace regresyonları geçer;
- `apps/admin/**` ve production yüzeyleri değişmez;
- staging aktivasyonu ayrıca yetkilendirilmeden yapılmaz.
