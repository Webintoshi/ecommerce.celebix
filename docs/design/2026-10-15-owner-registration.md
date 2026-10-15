# Celebix mağaza kaydı — 15 Ekim 2026

## Onaylanan görünüm

Açık sıcak zemin, mevcut Plus Jakarta Sans, koyu gri metin, açık kayısı CTA. Başlık: “Mağazanızı açın.” Ad ve soyad eşit genişlikte ayrı alanlar; ülke kodlu telefon, mağaza adı, çalışma ortamından gelen alan adı son eki, açıkça seçilen izinler. Başlangıç ekranında ek pazarlama metni yok. Sağdaki girişimci sahnesi mobilde formdan sonra gelir. Logo, yazılar ve bütün kontroller gerçek HTML; onay görseli sayfaya yapıştırılmadı.

## Görsel kaydı

- Yöntem: yerleşik Imagegen ile onaylanmış konseptten yalnızca fotoğrafın ayrıştırılması/yeniden üretilmesi.
- Onay referansı: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-8db73247-1b9f-486e-99d7-e0042b253b68.png`.
- Üretilen kaynak: `/Users/Celebix/.codex/generated_images/01a0f11a-700b-7262-82d9-1f30ff77ed5f/exec-77f5ab3d-6ee2-4ddf-a62c-a6fc9ed62af1.png`.
- Ürün varlıkları: `apps/owner/public/branding/signup/entrepreneurs-1448.webp` (115 KB) ve `entrepreneurs-720.webp` (48 KB). Pillow yalnızca boyutlandırma/WebP dönüşümü için kullanıldı.
- Son prompt:

> Use case: precise-object-edit. Input image is edit target: the APPROVED Celebix signup page concept. Extract/reconstruct ONLY the right-hand entrepreneurial lifestyle PHOTOGRAPH as a standalone production website asset, no interface. Preserve the same three adult entrepreneurs, foreground woman with white blouse packing orange ribbon parcel, second woman at laptop, smiling man carrying box, bright warm sunlit store studio, oak table and shelving, plants, cream palette, orange X details on packaging. Preserve the scene's framing, realistic natural faces and hands and authentic lighting. Remove ALL form fields, logo header, navigation, caption 'Sıra sizin markanızda.' and UI; fill that left area with more soft bright shop background. Keep people mostly in center and right so asset can blend into left webpage form. Output a clean large landscape photograph (about 4:3), without any page text, UI or watermark; wall poster may be blank. No baked white fade/gradient: CSS will fade the left and bottom edges. This is a photo asset, NOT a screenshot or web page mockup.

## Davranış ve veri

Ad/soyad sunucuda zorunlu ve 100 karakterle sınırlı. Telefon kimliği yalnızca mevcut browser-bound WhatsApp kanıtından gelir. İsimler, telefon principal sözleşmesinde opsiyonel `profile` olarak taşınır ve aynı tenant transaction'ında özel `saas.merchant_signup_profiles` tablosuna yazılır. Sonraki mağaza açılışı mevcut profil adını değiştirmez. Eski profilsiz ve OIDC çağrıları değişmedi. Yeni fonksiyon mevcut altı parametreli kanıt fonksiyonuna delege eder; kimlik/yetki doğrulamasını yeniden yazmaz.

Yeni ek migration: `202610150238_merchant_signup_profile.up.sql`; rollout öncesinde bir kez her farklı owner veritabanına uygulanır. NET ve SITE şu anda aynı veritabanını kullanıyor. Uygulama geri alınırsa ek şema korunur; veri varken down migration silmeyi reddeder.

Tarayıcıdaki başarısız son POST yanıtı ham JSON yerine nonce CSS içeren, scriptsiz kurtarma HTML'i gösterir. Aynı operasyon, isimler, mağaza ve izinler korunarak yalnızca kullanıcı tıklamasıyla tekrar denenir. Başarılı cross-host oturum aktarımı değiştirilmedi. Kurtarma HTML'inde `Referrer-Policy: same-origin` exact-origin kontrolünü korur.

## Kontroller

- Gerçek owner paketi: 1010 geçti, 13 ortam bağımlı test atlandı.
- Veri katmanı: 1066 geçti, 4 ortam bağımlı test atlandı.
- Tenant core: transform-types runner ile 39 geçti; mevcut npm komutundaki strip-only runner bu depodaki TypeScript parameter properties'i çalıştıramıyor.
- Değişen kayıt davranışı: 23 odaklı test + 6 gerçek DOM senaryosu.
- İzole PostgreSQL: profil kaydı, aynı işlem replay, isim değişimi çatışması, rollback, belirsiz commit kurtarma, eski profilsiz çağrı, mevcut profilin korunması, hatalı kanıt ve SQL yetkileri doğrulandı.
- Gerçek Chrome: 1440×1000, 1024×768 ve 390×844; ülke alanı, boş form, kod adımı, hatalı kod, tekrar deneme. Üretim kullanıcısına mesaj gönderilmedi veya deneme mağazası açılmadı.
- Yerel native POST→kurtarma HTML→tekrar POST zinciri, aynı isimleri/operasyonu ve gerçek Origin başlığını koruyarak başarıyla doğrulandı.
- Owner üretim derlemesi ve owner/contracts/tenant-core tip kontrolleri geçti. Veri katmanının ayrı tip kontrolünde, değiştirilmeyen `src/admin-login-security/internal.test.ts` dosyasında beş eski RequestInfo/Request tür hatası var; dosya SHA256 değeri dağıtılan c0551c2ea sürümüyle birebir aynı. Veri katmanının 1066 davranış testi geçti.
- Bağımsız incelemede bulunan kurtarma sayfasının referrer-policy ve kod hatasında odak sorunları düzeltildi; son inceleme onaylandı.
