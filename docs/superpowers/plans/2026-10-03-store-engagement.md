# Mağaza iletişim ve satış destek özellikleri uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Her özellik ayrı sorumluluk ve test çevrimiyle ilerler.

**Goal:** Kullanıcının belirlediği üç doğru konumda çalışan kargo çubuğu, yorum toplama ve stok bildirimi.

**Architecture:** Mevcut yayın tasarımı kargo politikasının kaynağıdır; mevcut yorum tablosu yorumların kaynağı olarak kalır. Yorum ve stok bildirimleri dar kapsamlı PostgreSQL kuyrukları ve ortak storefront bildirim görevi kullanır.

**Tech Stack:** TypeScript, Next.js, React, PostgreSQL 16, mevcut Resend HTTP bağlantısı.

**Spec:** `docs/superpowers/specs/2026-10-03-store-engagement.md`

## Global Constraints

- Yeni ücretli servis veya bağımlılık eklenmez. Mağaza adı/alan adı sabitlenmez.
- Mevcut ödeme yetkileri ve PayTR kanıt üreticisi korunur.
- Canlı müşterilere test e-postası gönderilmez; özellikler varsayılan kapalı kalır.
- Ortak kayıtlar mağaza sınırı, beklenen sürüm ve tekrar anahtarıyla korunur.

## Review Focus

- Kargo çubuğunun eşiğe ulaşmasına rağmen kasada ücret alınması: quote/complete/hosted aynı eşik sınır testini geçmelidir.
- Aynı müşterinin farklı mağazaları: token ve varyant başka mağazada kabul edilmemelidir.
- Sağlayıcı kabulünden sonra bağlantı kopması: aynı içerik/anahtar ile tekrar ve 24 saat sınırı doğrulanmalıdır.
- Stok artıp tekrar tükenmesi: gönderim öncesi yetkilendirme satılabilir stoğu yeniden kontrol etmelidir.
- Olumlu ve olumsuz yorumlar: puana göre davet veya moderasyon ayrıcalığı verilmemelidir.

## Görevler

### 1. Gerçek ücretsiz kargo ve yan sepet

- [x] Kargo sözleşmesi, tasarım alanı ve gerçek tutar hesabı için sınır testlerini önce yaz.
- [x] Composer, önizleme, ortak/Siora yan sepet ve SQL205 okuyucu/ödeme yollarını uygula.
- [x] Eski tasarımların değişmediğini ve gerçek teslimat tutarının çubukla eşleştiğini native PostgreSQL ile doğrula.

### 2. Ürünler / Yorumlar içinde toplama

- [x] Davet, doğrulanmış satın alma, moderasyon ve tek kayıt testlerini yaz.
- [x] Özel sözleşme/veri/SQL206, yönetim listesi, ayar penceresi, davet formu ve gönderim işini uygula.
- [x] Onay öncesi gizliliği, davet iptalini, tekrar ve mağaza ayrımını doğrula.

### 3. Mağaza Araçları stok bildirimi

- [x] Varyant/e-posta tekrarları, onay/iptal, rezervasyon ve gönderim testlerini yaz.
- [x] Sözleşme/veri/SQL207, yönetim kartı/penceresi, üç satın alma bileşeni ve public yolları uygula.
- [x] Stok yeniden kontrolü, tek gönderim, izin ve mağaza ayrımını doğrula.

### 4. Ortak bildirim görevi ve bütünleştirme

- [x] HTTP gönderimi, hata sınıfları, sabit anahtar ve yaşam döngüsü testlerini yaz.
- [x] `apps/storefront-shared/lib/customer-engagement/` altında transport/runtime ve mevcut build/start örüntüsüne uygun görev ekle.
- [x] Paket dışa aktarımlarını, merchant tür doğrulamasını ve test kayıtlarını birleştir.
- [x] İlgili testler, contracts/data/panel/storefront typecheck ve üretim buildlerini çalıştır.

### 5. Görsel kabul ve ortak yayın

- [x] Bağımsız kaynak/SQL incelemesindeki bulguları düzelt.
- [x] 1440/1024/390 ekran, Uygula/Vazgeç, klavye/odak ve public form akışlarını doğrula.
- [x] Son ortak sürüm ve ödeme kanıtlarına bağlı uyumlu SQL + storefront NET/SITE + panel NET/SITE yayını hazırla ve doğrula.
- [x] Canlı kabulü, test sınırlarını ve kalan gerçek bağımlılıkları operasyon raporuna kaydet.
