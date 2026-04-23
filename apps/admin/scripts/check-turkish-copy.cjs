const fs = require("node:fs");
const path = require("node:path");

const ADMIN_ROOT = path.resolve(__dirname, "..");

const SCAN_TARGETS = [
  "app",
  "components",
  "lib",
  "types",
  "public",
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".css",
]);

const IGNORED_DIRECTORIES = new Set([
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const UI_COPY_ASCII_TARGETS = [
  "app/admin/",
  "components/admin/",
  "app/api/admin/products/feed-preview/route.ts",
  "app/api/admin/products/feed-category-repair/route.ts",
  "app/api/admin/variant-attributes/route.ts",
  "app/api/admin/blog-posts/route.ts",
  "lib/admin/product-feed-fetch.ts",
];

const cp = (...values) => String.fromCodePoint(...values);

const BAD_ENCODING_PATTERNS = [
  { value: cp(0x00c3, 0x00bc), suggestion: "\\u00fc" },
  { value: cp(0x00c3, 0x0152), suggestion: "\\u00dc" },
  { value: cp(0x00c3, 0x009c), suggestion: "\\u00dc" },
  { value: cp(0x00c3, 0x00b6), suggestion: "\\u00f6" },
  { value: cp(0x00c3, 0x2013), suggestion: "\\u00d6" },
  { value: cp(0x00c3, 0x0096), suggestion: "\\u00d6" },
  { value: cp(0x00c3, 0x00a7), suggestion: "\\u00e7" },
  { value: cp(0x00c3, 0x2021), suggestion: "\\u00c7" },
  { value: cp(0x00c3, 0x0087), suggestion: "\\u00c7" },
  { value: cp(0x00c4, 0x00b1), suggestion: "\\u0131" },
  { value: cp(0x00c4, 0x00b0), suggestion: "\\u0130" },
  { value: cp(0x00c4, 0x0178), suggestion: "\\u011f" },
  { value: cp(0x00c4, 0x009f), suggestion: "\\u011f" },
  { value: cp(0x00c4, 0x017d), suggestion: "\\u011e" },
  { value: cp(0x00c4, 0x009e), suggestion: "\\u011e" },
  { value: cp(0x00c5, 0x0178), suggestion: "\\u015f" },
  { value: cp(0x00c5, 0x009f), suggestion: "\\u015f" },
  { value: cp(0x00c5, 0x017d), suggestion: "\\u015e" },
  { value: cp(0x00c5, 0x009e), suggestion: "\\u015e" },
  { value: cp(0x00e2, 0x20ac, 0x2122), suggestion: "'" },
  { value: cp(0x00e2, 0x0080, 0x0099), suggestion: "'" },
  { value: cp(0x00e2, 0x20ac, 0x02dc), suggestion: "'" },
  { value: cp(0x00e2, 0x0080, 0x0098), suggestion: "'" },
  { value: cp(0x00e2, 0x20ac, 0x0153), suggestion: "\\\"" },
  { value: cp(0x00e2, 0x0080, 0x009c), suggestion: "\\\"" },
  { value: cp(0x00e2, 0x20ac, 0x009d), suggestion: "\\\"" },
  { value: cp(0x00e2, 0x0080, 0x009d), suggestion: "\\\"" },
  { value: cp(0x00e2, 0x20ac, 0x201c), suggestion: "\\u2013" },
  { value: cp(0x00e2, 0x0080, 0x0093), suggestion: "\\u2013" },
  { value: cp(0x00e2, 0x20ac, 0x201d), suggestion: "\\u2014" },
  { value: cp(0x00e2, 0x0080, 0x0094), suggestion: "\\u2014" },
  { value: cp(0x00e2, 0x20ac, 0x00a6), suggestion: "\\u2026" },
  { value: cp(0x00e2, 0x0080, 0x00a6), suggestion: "\\u2026" },
  { value: cp(0x00e2, 0x201a, 0x00ba), suggestion: "\\u20ba" },
  { value: cp(0x00c2, 0x00a0), suggestion: "normal space" },
  { value: cp(0xfffd), suggestion: "UTF-8 replacement character removed" },
];

const ASCII_TURKISH_PATTERNS = [
  { regex: /\bBugunku\b/g, suggestion: "Bug\\u00fcnk\\u00fc" },
  { regex: /\bDonusum\b/g, suggestion: "D\\u00f6n\\u00fc\\u015f\\u00fcm" },
  { regex: /\bUrun(?:u|ler|lere|lerin|lerde|lerinizi|e)?\b/g, suggestion: "\\u00dcr\\u00fcn / \\u00fcr\\u00fcn" },
  { regex: /\bMusteri(?:ler|ye|yi|lerin|lerde|lerle|si)?\b/g, suggestion: "M\\u00fc\\u015fteri / m\\u00fc\\u015fteri" },
  { regex: /\bSiparis(?:ler|i|in|e|te)?\b/g, suggestion: "Sipari\\u015f / sipari\\u015f" },
  { regex: /\bOdeme(?:yi|de|nin|ler)?\b/g, suggestion: "\\u00d6deme / \\u00f6deme" },
  { regex: /\bGiris\b/g, suggestion: "Giri\\u015f" },
  { regex: /\bSifre\b/g, suggestion: "\\u015eifre" },
  { regex: /\bYonetici\b/g, suggestion: "Y\\u00f6netici" },
  { regex: /\bGorsel\b/g, suggestion: "G\\u00f6rsel" },
  { regex: /\bYontem(?:leri|i)?\b/g, suggestion: "Y\\u00f6ntem / y\\u00f6ntem" },
  { regex: /\bAnlik\b/g, suggestion: "Anl\\u0131k" },
  { regex: /\bZiyaretci(?:ler)?\b/g, suggestion: "Ziyaret\\u00e7i / ziyaret\\u00e7iler" },
  { regex: /\bTurkiye\b/g, suggestion: "T\\u00fcrkiye" },
  { regex: /\bIcerik\b/g, suggestion: "\\u0130\\u00e7erik" },
  { regex: /\bKisilestirme\b/g, suggestion: "Ki\\u015fiselle\\u015ftirme" },
  { regex: /\bYukleniyor\b/g, suggestion: "Y\\u00fckleniyor" },
  { regex: /\bBasarisiz\b/g, suggestion: "Ba\\u015far\\u0131s\\u0131z" },
  { regex: /\bGuncel(?:le)?\b/g, suggestion: "G\\u00fcncel / g\\u00fcncelle" },
  { regex: /\bOnizle\b/g, suggestion: "\\u00d6nizle" },
  { regex: /\bGoruntule\b/g, suggestion: "G\\u00f6r\\u00fcnt\\u00fcle" },
  { regex: /\bAyarlari\b/g, suggestion: "Ayarlar\\u0131" },
  { regex: /\bSTOK GUNCELLE\b/g, suggestion: "STOK G\\u00dcNCELLE" },
];

const ASCII_TURKISH_PHRASES = [
  { regex: /Yetkisiz erisim/g, suggestion: "Yetkisiz eri\\u015fim" },
  { regex: /Odeme ayarlari kaydedildi/g, suggestion: "\\u00d6deme ayarlar\\u0131 kaydedildi" },
  { regex: /iyzico odeme baslatilamadi/g, suggestion: "iyzico \\u00f6deme ba\\u015flat\\u0131lamad\\u0131" },
  { regex: /PAYTR odeme baslatilamadi/g, suggestion: "PAYTR \\u00f6deme ba\\u015flat\\u0131lamad\\u0131" },
  { regex: /Paynet odeme linki olusturulamadi/g, suggestion: "Paynet \\u00f6deme linki olu\\u015fturulamad\\u0131" },
  { regex: /PAYTR magaza numarasi/g, suggestion: "PAYTR ma\\u011faza numaras\\u0131" },
  { regex: /Giris basarisiz/g, suggestion: "Giri\\u015f ba\\u015far\\u0131s\\u0131z" },
  { regex: /Giris yapildi/g, suggestion: "Giri\\u015f yap\\u0131ld\\u0131" },
  { regex: /Anlik Ziyaretciler/g, suggestion: "Anl\\u0131k Ziyaret\\u00e7iler" },
];

function walkDirectory(dirPath, collected) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, collected);
      continue;
    }

    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
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
    } else if (stats.isFile() && TEXT_EXTENSIONS.has(path.extname(target))) {
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

function collectRegexMatches(content, regex) {
  const matches = [];
  const globalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let match;
  while ((match = globalRegex.exec(content)) !== null) {
    matches.push({ index: match.index, value: match[0] });
  }
  return matches;
}

function collectLiteralMatches(content, value) {
  const matches = [];
  let index = content.indexOf(value);

  while (index !== -1) {
    matches.push({ index, value });
    index = content.indexOf(value, index + value.length);
  }

  return matches;
}

function shouldRunAsciiRules(relativePath) {
  return UI_COPY_ASCII_TARGETS.some((target) => relativePath === target || relativePath.startsWith(target));
}

function escapeValue(value) {
  return [...value]
    .map((char) => {
      const code = char.codePointAt(0);
      if (code >= 0x20 && code <= 0x7e) {
        return char;
      }
      return `\\u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

const problems = [];

for (const filePath of resolveScanFiles()) {
  const content = fs.readFileSync(filePath, "utf8");
  const lineOffsets = buildLineOffsets(content);
  const relativePath = path.relative(ADMIN_ROOT, filePath).replace(/\\/g, "/");

  for (const rule of BAD_ENCODING_PATTERNS) {
    for (const match of collectLiteralMatches(content, rule.value)) {
      problems.push({
        file: relativePath,
        line: getLineNumber(lineOffsets, match.index),
        value: escapeValue(match.value),
        suggestion: rule.suggestion,
      });
    }
  }

  if (!shouldRunAsciiRules(relativePath)) {
    continue;
  }

  for (const rule of [...ASCII_TURKISH_PATTERNS, ...ASCII_TURKISH_PHRASES]) {
    for (const match of collectRegexMatches(content, rule.regex)) {
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
  console.error("Turkce metin denetimi basarisiz oldu. Duzeltmeniz gereken ifadeler:");
  for (const problem of problems) {
    console.error(`- ${problem.file}:${problem.line} -> "${problem.value}" | oneri: ${problem.suggestion}`);
  }
  process.exit(1);
}

console.log("Turkce metin denetimi gecti.");
