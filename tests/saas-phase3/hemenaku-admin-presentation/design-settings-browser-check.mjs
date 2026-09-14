// Invoke only inside the documented cua_repl browser runtime with its existing
// browser/tab handles. No standalone browser, credentials, live URLs or mutations.
import assert from "node:assert/strict";

async function localFixture(tab) {
  const url = new URL(await tab.url());
  assert.equal(url.origin, "http://127.0.0.1:3427");
  assert.equal(url.pathname, "/design-settings-fix");
  const snapshot = await tab.playwright.domSnapshot();
  assert.ok(snapshot.includes("İZOLE FIXTURE"));
  assert.ok(snapshot.includes("Tasarım önizleme araçları"));
  assert.ok(!snapshot.includes('- dialog "'), "Close the fixture modal before layout measurement");
}

export async function checkViewport(browser, tab, width, height) {
  await localFixture(tab);
  assert.ok([1440, 1024, 390].includes(width));
  await (await browser.capabilities.get("viewport")).set({ width, height });
  await tab.playwright.domSnapshot();
  await tab.playwright.getByRole("button", { name: "Masaüstü", exact: true }).press("Enter");
  await tab.playwright.domSnapshot();
  const result = await tab.playwright.evaluate(() => {
    const toolbar = document.querySelector('[data-design-toolbar="true"]');
    const toolbarRect = toolbar?.getBoundingClientRect();
    const controls = [...(toolbar?.querySelectorAll("button,summary") ?? [])]
      .filter(element => ["Alanlar", "Masaüstü", "Mobil", "Yayınla"].includes(element.textContent.trim()))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { label: element.textContent.trim(), width: rect.width, height: rect.height,
          visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
          disabled: element.hasAttribute("disabled"), tabIndex: element.tabIndex,
          centerHit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button,summary") === element };
      });
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      toolbar: toolbarRect?.toJSON(), controls };
  });
  assert.equal(result.width, width);
  assert.equal(result.scrollWidth, width, "No document horizontal overflow");
  assert.ok(result.toolbar.width > 0);
  assert.ok(result.toolbar.left >= 0 && result.toolbar.right <= width);
  assert.equal(result.controls.length, 4);
  for (const control of result.controls) {
    assert.ok(control.visible, `${control.label} is visible at ${width}`);
    assert.ok(control.centerHit, `${control.label} center is not covered at ${width}`);
    assert.ok(control.width >= 44 && control.height >= 44, `${control.label} touch target at ${width}`);
    if (!control.disabled) assert.ok(control.tabIndex >= 0, `${control.label} keyboard target`);
  }
  return result;
}

export async function checkMobileCanvas(browser, tab) {
  await localFixture(tab);
  await (await browser.capabilities.get("viewport")).set({ width: 1440, height: 1000 });
  await tab.playwright.getByRole("button", { name: "Mobil", exact: true }).press("Enter");
  await tab.playwright.domSnapshot();
  const result = await tab.playwright.evaluate(() => ({
    outerWidth: innerWidth,
    canvasWidth: document.querySelector('[data-mode="mobile"]')?.getBoundingClientRect().width,
    mobilePressed: [...document.querySelectorAll('button')].find(element => element.textContent.trim() === "Mobil")?.getAttribute("aria-pressed"),
    navDisplay: [...document.querySelectorAll('[aria-label="Ana menü"]')].map(element => getComputedStyle(element).display),
    productColumns: [...document.querySelectorAll('[class*="canvasProductGrid"]')].map(element => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length),
    categoryColumns: [...document.querySelectorAll('[class*="canvasCategoryGrid"]')].map(element => ({ layout: element.getAttribute("data-layout"), columns: getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length })),
  }));
  assert.equal(result.outerWidth, 1440);
  assert.equal(result.canvasWidth, 390);
  assert.equal(result.mobilePressed, "true");
  assert.ok(result.navDisplay.length > 0 && result.navDisplay.every(display => display === "none"));
  assert.ok(result.productColumns.length >= 2 && result.productColumns.every(columns => columns === 2));
  // An empty category selection has no grid; it is reported, never called PASS.
  for (const category of result.categoryColumns) assert.equal(category.columns, category.layout === "duo" ? 1 : 2);
  return result;
}

export async function checkModalFocus(browser, tab) {
  await localFixture(tab);
  await (await browser.capabilities.get("viewport")).set({ width: 390, height: 844 });
  await tab.playwright.getByLabel("Tasarım alanlarını aç", { exact: true }).press("Enter");
  assert.ok((await tab.playwright.domSnapshot()).includes("Header ve menü Logo ve menü"));
  await tab.playwright.getByRole("button", { name: "Header ve menü Logo ve menü yerleşimini düzenleyin.", exact: true }).click();
  assert.ok((await tab.playwright.domSnapshot()).includes('- dialog "Header ve menü"'));
  await tab.playwright.getByRole("dialog", { name: "Header ve menü", exact: true }).press("Escape");
  const result = await tab.playwright.evaluate(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect();
    return { modalOpen: !!document.querySelector('[role="dialog"]'), tag: element?.tagName,
      label: element?.getAttribute("aria-label"), rect: rect?.toJSON(),
      outlineStyle: element ? getComputedStyle(element).outlineStyle : null,
      outlineWidth: element ? getComputedStyle(element).outlineWidth : null };
  });
  assert.equal(result.modalOpen, false);
  assert.equal(result.tag, "SUMMARY");
  assert.equal(result.label, "Tasarım alanlarını aç");
  assert.ok(result.rect.width >= 44 && result.rect.height >= 44);
  assert.notEqual(result.outlineStyle, "none");
  assert.ok(Number.parseFloat(result.outlineWidth) > 0);
  return result;
}
