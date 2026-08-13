import type { ReactNode } from "react";

export function ProductEditorSection({ title, description, children, open = false, id }: Readonly<{
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  id?: string;
}>) {
  return <details id={id} className="onboarding-editor-section" open={open}><summary><span><strong>{title}</strong><small>{description}</small></span><i aria-hidden="true">⌄</i></summary><div>{children}</div></details>;
}
