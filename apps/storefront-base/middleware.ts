import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Basit rate limiting için in-memory store (Production'da Redis kullanılmalı)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 dakika
const RATE_LIMIT_MAX = 30; // Dakikada max 30 istek (botlar için)
const AI_BOT_RATE_LIMIT = 10; // AI botları için dakikada 10 istek

// AI Bot User-Agent listesi
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'GoogleOther',
  'PerplexityBot',
  'CCBot',
  'Diffbot',
  'Cohere-ai',
  'ImagesiftBot',
  'Meta-ExternalAgent',
  'FacebookBot',
  'PetalBot',
  'YouBot',
];

// Genel bot listesi
const GENERAL_BOTS = [
  'bot', 'crawler', 'spider', 'scrapy',
  'googlebot', 'bingbot', 'yandex', 'duckduckbot',
  'slurp', 'facebot', 'instagram', 'applebot',
  'amazonbot'
];

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.ip || 'unknown';
  const url = request.nextUrl.pathname;
  
  // Cache-Control headers for dynamic content - NO CACHE
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  
  // Prevent caching for product pages and API calls
  if (url.startsWith('/urunler/') || url.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');
  }
  
  // Static dosyaları kontrol etme
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
  const isStatic = staticExtensions.some(ext => url.endsWith(ext));
  
  if (isStatic) {
    return NextResponse.next();
  }

  // AI Bot kontrolü
  const isAIBot = AI_BOTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
  const isGeneralBot = GENERAL_BOTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
  const isBot = isAIBot || isGeneralBot;

  // Rate Limiting Kontrolü (Botlar için)
  if (isBot) {
    const now = Date.now();
    const limitKey = `${ip}:${userAgent.slice(0, 50)}`; // IP + UserAgent'in ilk 50 karakteri
    const currentData = rateLimitMap.get(limitKey);

    if (currentData) {
      // Zaman penceresi dolmuş mu?
      if (now - currentData.timestamp > RATE_LIMIT_WINDOW) {
        // Reset
        rateLimitMap.set(limitKey, { count: 1, timestamp: now });
      } else {
        // Limit aşımı kontrolü
        const limit = isAIBot ? AI_BOT_RATE_LIMIT : RATE_LIMIT_MAX;
        if (currentData.count >= limit) {
          console.warn(`[Rate Limit] Bot engellendi: ${userAgent.slice(0, 50)} - IP: ${ip}`);
          return new NextResponse('Çok fazla istek. Lütfen daha sonra tekrar deneyin.', {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
            },
          });
        }
        // Sayacı artır
        rateLimitMap.set(limitKey, { 
          count: currentData.count + 1, 
          timestamp: currentData.timestamp 
        });
      }
    } else {
      // İlk istek
      rateLimitMap.set(limitKey, { count: 1, timestamp: now });
    }

    // AI botları için ek güvenlik header'ları
    if (isAIBot) {
      // Use existing response if it has cache headers, otherwise create new
      
      // AI botlarına özel header'lar
      const botResponse = NextResponse.next();
      botResponse.headers.set('X-Robots-Tag', 'noai, noimageai');
      botResponse.headers.set('X-Bot-Type', 'AI');
      botResponse.headers.set('X-RateLimit-Limit', String(AI_BOT_RATE_LIMIT));
      
      // Hassas sayfalar için erişim kontrolü
      if (url.startsWith('/admin') || url.startsWith('/api')) {
        console.warn(`[AI Bot Engellendi] ${userAgent.slice(0, 50)} - URL: ${url}`);
        return new NextResponse('Forbidden', { status: 403 });
      }
      
      return botResponse;
    }

    // Genel botlar için
    if (isGeneralBot) {
      const botResponse = NextResponse.next();
      
      // Ana sayfa ve ürün sayfaları için noindex (isteğe bağlı)
      if (url === '/' || url.startsWith('/urun') || url.startsWith('/koleksiyon')) {
        // botResponse.headers.set('X-Robots-Tag', 'noindex'); // İsterseniz aktif edin
      }
      
      return botResponse;
    }
  }

  // Temizlik: Eski kayıtları sil (bellek yönetimi)
  if (rateLimitMap.size > 10000) {
    const now = Date.now();
    for (const [key, data] of rateLimitMap.entries()) {
      if (now - data.timestamp > RATE_LIMIT_WINDOW * 2) {
        rateLimitMap.delete(key);
      }
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
