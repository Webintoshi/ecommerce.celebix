import assert from "node:assert/strict";
import test from "node:test";
import React,{type ReactNode} from "react";
import {compile,withEditor} from "./design-editor-test-utils.ts";
const {DesignWorkspaceToolbar}=compile<{DesignWorkspaceToolbar:(props:Record<string,unknown>)=>ReactNode}>(new URL("./DesignWorkspace.tsx",import.meta.url),{
 "@/components/panel/PanelTopbarChrome":{PanelTopbarBridge:()=>null},"@/lib/storefront-design-ui/client":{},"@/lib/storefront-design-preview-ui/use-preview-resources":{},"./DesignPreview":{},"./DesignStepEditor":{},
});
test("toolbar preserves surface selection triggers, ordering and device preview controls",async()=>withEditor(async({container,render,click})=>{
 const surfaces:string[]=[],modes:string[]=[],triggers:HTMLElement[]=[];let orders=0;
 await render(React.createElement(DesignWorkspaceToolbar,{previewMode:"desktop",onSelectSurface:(surface:string,trigger:HTMLElement)=>{surfaces.push(surface);triggers.push(trigger);},onPreviewModeChange:(mode:string)=>modes.push(mode),onOrder:()=>orders++}));
 const button=(label:string)=>{const found=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes(label));assert.ok(found);return found;};
 await click(button("Mobil"));await click(button("Sıralama"));await click(button("Footer"));assert.deepEqual(modes,["mobile"]);assert.equal(orders,1);assert.deepEqual(surfaces,["footer"]);assert.equal(triggers[0]?.tagName,"SUMMARY");assert.doesNotMatch(container.textContent??"",/Yayınla/);
}));
