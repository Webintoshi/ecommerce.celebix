import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

type EditorModule = Readonly<{
  normalizePastedProductDescriptionHtml: (
    source: string,
    parse?: (source: string) => Document,
  ) => string;
}>;

const moduleUrl = new URL("./product-description-editor.ts", import.meta.url).href;

async function editorModule(): Promise<EditorModule> {
  return import(moduleUrl).catch(() => ({
    normalizePastedProductDescriptionHtml: () => "",
  }));
}

function parseHtml(source: string): Document {
  const window = new Window();
  window.document.body.innerHTML = source;
  return window.document as unknown as Document;
}

test("preserves semantic web formatting while removing foreign presentation", async () => {
  const { normalizePastedProductDescriptionHtml } = await editorModule();
  const result = normalizePastedProductDescriptionHtml(`
    <h2 style="font-family: Arial; font-size: 42px">Ürün Özellikleri</h2>
    <p style="margin: 48px; background: red">
      Bu ürün <span style="font-weight: 700">14 ayar gerçek altındır.</span>
      <a href="https://example.com/detail" style="color: green">Detay</a>
    </p>
    <ul style="padding-left: 80px"><li>2.16 gram</li><li>585 ayar</li><li>Sigortalı kargo</li></ul>
  `, parseHtml);

  assert.match(result, /<h2>Ürün Özellikleri<\/h2>/);
  assert.match(result, /<strong>14 ayar gerçek altındır[.]<\/strong>/);
  assert.match(result, /<ul><li>2[.]16 gram<\/li><li>585 ayar<\/li><li>Sigortalı kargo<\/li><\/ul>/);
  assert.match(result, /<a href="https:\/\/example[.]com\/detail"/);
  assert.doesNotMatch(result, /style=|font-family|font-size|background/i);
});

test("normalizes Google Docs and Word inline semantics without flattening content", async () => {
  const { normalizePastedProductDescriptionHtml } = await editorModule();
  const result = normalizePastedProductDescriptionHtml(`
    <p class="MsoHeading2" style="mso-style-name:'Heading 2'; font-size: 18pt">Bakım Bilgileri</p>
    <p class="MsoNormal"><span style="font-style: italic; text-decoration: underline line-through">Nazikçe temizleyin</span></p>
    <table style="width: 900px"><tbody><tr><th>Özellik</th><th>Değer</th></tr><tr><td>Ayar</td><td>14 ayar</td></tr></tbody></table>
  `, parseHtml);

  assert.match(result, /<h2>Bakım Bilgileri<\/h2>/);
  assert.match(result, /<em><u><del>Nazikçe temizleyin<\/del><\/u><\/em>/);
  assert.match(result, /<table><tbody><tr><th>Özellik<\/th><th>Değer<\/th><\/tr>/);
  assert.doesNotMatch(result, /Mso|style=/i);
});

test("turns typical Word list paragraphs into a semantic list", async () => {
  const { normalizePastedProductDescriptionHtml } = await editorModule();
  const result = normalizePastedProductDescriptionHtml(`
    <p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>2.16 gram</p>
    <p class="MsoListParagraphCxSpMiddle" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>585 ayar</p>
    <p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Sigortalı kargo</p>
  `, parseHtml);

  assert.equal(result, "<ul><li>2.16 gram</li><li>585 ayar</li><li>Sigortalı kargo</li></ul>");
});

test("removes executable markup and unsafe links from pasted HTML", async () => {
  const { normalizePastedProductDescriptionHtml } = await editorModule();
  const result = normalizePastedProductDescriptionHtml(`
    <script>alert(1)</script><iframe src="https://unsafe.example"></iframe>
    <p onclick="alert(1)">Güvenli metin <a href="javascript:alert(1)">zararlı bağlantı</a></p>
  `, parseHtml);

  assert.equal(result, "<p>Güvenli metin <a>zararlı bağlantı</a></p>");
  assert.doesNotMatch(result, /script|iframe|onclick|javascript:/i);
});

test("keeps meaningful spaces between adjacent inline marks", async () => {
  const { normalizePastedProductDescriptionHtml } = await editorModule();
  const result = normalizePastedProductDescriptionHtml(
    "<p><strong>Altın</strong> <em>kolye</em> <a href=\"https://example.com\">detayı</a></p>",
    parseHtml,
  );

  assert.equal(result, "<p><strong>Altın</strong> <em>kolye</em> <a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">detayı</a></p>");
});

test("product description field exposes one WYSIWYG surface and the existing form field", async () => {
  const source = await readFile(new URL("../components/catalog/ProductDescriptionField.tsx", import.meta.url), "utf8");

  assert.match(source, /@tiptap\/react/);
  assert.match(source, /EditorContent/);
  assert.match(source, /name="description"/);
  assert.match(source, /type="hidden"/);
  assert.match(source, /Ürünün özelliklerini ve müşterinin bilmesi gereken bilgileri ekleyin[.]/);
  assert.doesNotMatch(source, /Markdown desteklenir|Markdown önizleme|<textarea/);
});
