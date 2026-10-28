import assert from 'node:assert/strict';
import test from 'node:test';
import type {ContentAuthoringBlock,ContentAuthoringTextNode} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
import {renderContentAuthoringDescription} from './render.ts';

const word=(text:string):ContentAuthoringTextNode=>({type:'text',text});
const fact=(factRef:string,value:string,unit?:string):ContentAuthoringTextNode=>({type:'fact',factRef,value,...(unit===undefined?{}:{unit})});
const bold=(value:string,unit?:string)=>fact('format:bold:product:title:0',value,unit);

test('a server-issued bold alias renders its complete escaped fact inside fixed strong tags',()=>{
 const blocks:ContentAuthoringBlock[]=[{type:'paragraph',children:[word('Ürün: '),bold('Kesme Erişte'),word('. Ağırlık: '),bold('250','g')]}];
 assert.equal(renderContentAuthoringDescription(blocks),'<p>Ürün: <strong>Kesme Erişte</strong>. Ağırlık: <strong>250 g</strong></p>');
});

test('legacy text and facts retain exact rendering, including literal Markdown and source assertion stars',()=>{
 const blocks:ContentAuthoringBlock[]=[
  {type:'heading',level:4,children:[word('Eski başlık')]},
  {type:'paragraph',children:[word('**Metin** format:bold:product:title:0 '),fact('product:weight:0','14.89','g'),word(' '),fact('product:existing:0','**Satıcının özgün ifadesi**')]},
 ];
 assert.equal(renderContentAuthoringDescription(blocks),'<h4>Eski başlık</h4><p>**Metin** format:bold:product:title:0 14.89 g **Satıcının özgün ifadesi**</p>');
});

test('bold aliases cannot turn text, fact values, units or references into executable HTML',()=>{
 const blocks:ContentAuthoringBlock[]=[{type:'paragraph',children:[word('<script>"&\'</script>'),bold('<img src=x onerror="run()">','<svg>'),fact('product:existing:0','<iframe src="x">')]}];
 assert.equal(renderContentAuthoringDescription(blocks),'<p>&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;<strong>&lt;img src=x onerror=&quot;run()&quot;&gt; &lt;svg&gt;</strong>&lt;iframe src=&quot;x&quot;&gt;</p>');
 assert.equal(renderContentAuthoringDescription([{type:'paragraph',children:[fact('format:bold:<img src=x onerror=run()>','Safe')]}]),'<p><strong>Safe</strong></p>','fact refs select a fixed style and are never emitted as markup');
});

test('the exact bold prefix works inside headings, both list kinds and every table cell',()=>{
 const blocks:ContentAuthoringBlock[]=[
  {type:'heading',level:2,children:[bold('Ürün')]},
  {type:'heading',level:3,children:[word('Seçenek: '),bold('250g')]},
  {type:'list',ordered:false,items:[[bold('Bir')],[word('Normal')]]},
  {type:'list',ordered:true,items:[[word('İki '),bold('üç')]]},
  {type:'table',rows:[[[bold('Sol')],[word('Sağ')]],[[word('Alt')],[bold('Son')]]]},
 ];
 assert.equal(renderContentAuthoringDescription(blocks),'<h2><strong>Ürün</strong></h2><h3>Seçenek: <strong>250g</strong></h3><ul><li><strong>Bir</strong></li><li>Normal</li></ul><ol><li>İki <strong>üç</strong></li></ol><table><tbody><tr><td><strong>Sol</strong></td><td>Sağ</td></tr><tr><td>Alt</td><td><strong>Son</strong></td></tr></tbody></table>');
});

test('similar ref strings and text markers cannot request formatting',()=>{
 const blocks:ContentAuthoringBlock[]=[{type:'paragraph',children:[fact('format:bold','A'),fact('format:bolder:product:title:0','B'),fact('product:format:bold:title:0','C'),word('**D**')]}];
 assert.equal(renderContentAuthoringDescription(blocks),'<p>ABC**D**</p>');
});

test('the existing rendered HTML limit includes added strong tags',()=>{
 const content='a'.repeat(99);const plain:ContentAuthoringBlock[]=[{type:'paragraph',children:Array.from({length:100},()=>fact('product:title:0',content))}];
 assert.equal(renderContentAuthoringDescription(plain).length,9907);
 const emphasized:ContentAuthoringBlock[]=[{type:'paragraph',children:Array.from({length:100},()=>bold(content))}];
 assert.throws(()=>renderContentAuthoringDescription(emphasized),/content_authoring_description_too_large/);
});
