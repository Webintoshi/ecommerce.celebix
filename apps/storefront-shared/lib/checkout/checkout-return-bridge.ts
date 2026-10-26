import { checkoutContextResultPath } from "./checkout-context.ts";

const MESSAGE = "celebix:checkout-result-check";
const CONTEXT_PARENT = "^/checkout/payment/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

export function checkoutContextFrameReturnScript(contextId: string): string {
  const destination = checkoutContextResultPath(contextId);
  return `window.addEventListener("message",function(event){var frame=document.getElementById("celebix-hosted-payment");if(event.origin!==window.location.origin||!frame||event.source!==frame.contentWindow||event.data!==${JSON.stringify(MESSAGE)})return;window.location.replace(${JSON.stringify(destination)});});`;
}

export function checkoutResultBridgeScript(legacyTarget?: "/checkout/payment/result"): string {
  if (legacyTarget !== undefined && legacyTarget !== "/checkout/payment/result") throw new TypeError("checkout_context_invalid");
  const legacy = legacyTarget === undefined ? "" : `try{if(window.top&&window.top!==window){window.top.location.replace(${JSON.stringify(legacyTarget)});}else{window.location.replace(${JSON.stringify(legacyTarget)});}}catch{window.location.replace(${JSON.stringify(legacyTarget)});}`;
  // This marker only requests a server status read. The parent owns the selector
  // and accepts messages solely from the exact iframe that it rendered.
  return `(function(){try{if(window.parent&&window.parent!==window&&window.parent.location.origin===window.location.origin&&new RegExp(${JSON.stringify(CONTEXT_PARENT)}).test(window.parent.location.pathname)){window.parent.postMessage(${JSON.stringify(MESSAGE)},window.location.origin);return;}}catch{}${legacy}})();`;
}
