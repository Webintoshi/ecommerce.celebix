import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
test('product authoring delegates operation choice to the server without a settings bootstrap or customer writing controls',async()=>{
 const source=await readFile(new URL('./ContentAuthoringPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/action:'auto'/);assert.match(source,/tone:'neutral'/);assert.match(source,/length:'medium'/);assert.match(source,/note:''/);
 assert.doesNotMatch(source,/acquireStoreWritingDefaults|<select|<textarea|İsteğe bağlı ayarlar|Yazım ayarları yükleniyor/);
});
