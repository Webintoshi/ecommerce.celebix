const fs = require("node:fs");
const path = require("node:path");

const ADMIN_ROOT = path.resolve(__dirname, "..");

const SCAN_TARGETS = [
  "app/admin",
  "components/admin",
  "app/api/admin",
  "app/api/payments/checkout/route.ts",
  "lib/payment-providers.ts",
  "lib/payment-runtime.ts",
  "lib/categories.ts",
  "lib/admin-dashboard.ts",
];

const BAD_ENCODING_PATTERNS = [
  { regex: /Ã|â‚º|â€¢|Ä±|Ä°|ÄŸ|ÅŸ|Ãœ|Ã–|Ã§|Ã¼|Ã¶/g, suggestion: "Dosya UTF-8 Türkçe karakterlerle kaydedilmeli." },
];

const ASCII_TURKISH_PATTERNS = [
  { regex: /\bBugunku\b/g, suggestion: "Bugünkü" },
  { regex: /\bDonusum\b/g, suggestion: "Dönüşüm" },
  { regex: /\bUrun(?:u|ler|lere|lerin|lerde|lerinizi|e)?\b/g, suggestion: "Ürün / ürün" },
  { regex: /\bMusteri(?:ler|ye|yi|lerin|lerde|lerle|si)?\b/g, suggestion: "Müşteri / müşteri" },
  { regex: /\bSiparis(?:ler|i|in|e|te)?\b/g, suggestion: "Sipariş / sipariş" },
  { regex: /\bOdeme(?:yi|de|nin|ler)?\b/g, suggestion: "Ödeme / ödeme" },
  { regex: /\bGiris\b/g, suggestion: "Giriş" },
  { regex: /\bSifre\b/g, suggestion: "Şifre" },
  { regex: /\bYonetici\b/g, suggestion: "Yönetici" },
  { regex: /\bGorsel\b/g, suggestion: "Görsel" },
  { regex: /\bYontem(?:leri|i)?\b/g, suggestion: "Yöntem / yöntem" },
  { regex: /\bAnlik\b/g, suggestion: "Anlık" },
  { regex: /\bZiyaretci(?:ler)?\b/g, suggestion: "Ziyaretçi / ziyaretçiler" },
  { regex: /\bTurkiye\b/g, suggestion: "Türkiye" },
  { regex: /\bIcerik\b/g, suggestion: "İçerik" },
  { regex: /\bKisilestirme\b/g, suggestion: "Kişiselleştirme" },
  { regex: /\bYukleniyor\b/g, suggestion: "Yükleniyor" },
  { regex: /\bBasarisiz\b/g, suggestion: "Başarısız" },
  { regex: /\bGuncel(?:le)?\b/g, suggestion: "Güncel / güncelle" },
  { regex: /\bOnizle\b/g, suggestion: "Önizle" },
  { regex: /\bGoruntule\b/g, suggestion: "Görüntüle" },
  { regex: /\bAyarlari\b/g, suggestion: "Ayarları" },
  { regex: /\bSTOK GUNCELLE\b/g, suggestion: "STOK GÜNCELLE" },
];

const ASCII_TURKISH_PHRASES = [
  { regex: /Yetkisiz erisim/g, suggestion: "Yetkisiz erişim" },
  { regex: /Odeme ayarlari kaydedildi/g, suggestion: "Ödeme ayarları kaydedildi" },
  { regex: /iyzico odeme baslatilamadi/g, suggestion: "iyzico ödeme başlatılamadı" },
  { regex: /PAYTR odeme baslatilamadi/g, suggestion: "PAYTR ödeme başlatılamadı" },
  { regex: /Paynet odeme linki olusturulamadi/g, suggestion: "Paynet ödeme linki oluşturulamadı" },
  { regex: /PAYTR magaza numarasi/g, suggestion: "PAYTR mağaza numarası" },
  { regex: /Giris basarisiz/g, suggestion: "Giriş başarısız" },
  { regex: /Giris yapildi/g, suggestion: "Giriş yapıldı" },
  { regex: /Anlik Ziyaretciler/g, suggestion: "Anlık Ziyaretçiler" },
];

const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

function walkDirectory(dirPath, collected) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, collected);
      continue;
    }

    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      collected.push(fullPath);
    }
  }
}

function resolveScanFiles() {
  const files = [];

  for (const target of SCAN_TARGETS) {
    const fullTargetPath = path.join(ADMIN_ROOT, target);
    if (!fs.existsSync(fullTargetPath)) {
      continue;
    }

    const stats = fs.statSync(fullTargetPath);
    if (stats.isDirectory()) {
      walkDirectory(fullTargetPath, files);
    } else if (stats.isFile()) {
      files.push(fullTargetPath);
    }
  }

  return files;
}

function buildLineOffsets(content) {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function getLineNumber(lineOffsets, matchIndex) {
  let low = 0;
  let high = lineOffsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= matchIndex) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return high + 1;
}

function collectMatches(content, regex) {
  const matches = [];
  const globalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let match;
  while ((match = globalRegex.exec(content)) !== null) {
    matches.push({ index: match.index, value: match[0] });
  }
  return matches;
}

const problems = [];

for (const filePath of resolveScanFiles()) {
  const content = fs.readFileSync(filePath, "utf8");
  const lineOffsets = buildLineOffsets(content);
  const relativePath = path.relative(ADMIN_ROOT, filePath).replace(/\\/g, "/");

  for (const rule of [...BAD_ENCODING_PATTERNS, ...ASCII_TURKISH_PATTERNS, ...ASCII_TURKISH_PHRASES]) {
    for (const match of collectMatches(content, rule.regex)) {
      problems.push({
        file: relativePath,
        line: getLineNumber(lineOffsets, match.index),
        value: match.value,
        suggestion: rule.suggestion,
      });
    }
  }
}

if (problems.length > 0) {
  console.error("Türkçe metin denetimi başarısız oldu. Düzeltmeniz gereken ifadeler:");
  for (const problem of problems) {
    console.error(`- ${problem.file}:${problem.line} -> "${problem.value}" | öneri: ${problem.suggestion}`);
  }
  process.exit(1);
}

console.log("Türkçe metin denetimi geçti.");
