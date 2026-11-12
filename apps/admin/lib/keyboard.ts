import type { KeyboardEvent } from "react";

export function isActionableEnter(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229;
}
