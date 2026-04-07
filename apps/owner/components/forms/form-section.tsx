import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn("border-b border-[#E2E8F0] pb-6 mb-6 last:border-0 last:pb-0 last:mb-0", className)}>
      <div className="mb-4">
        <h4 className="text-sm font-bold uppercase tracking-wider text-[#2B2B2B]">{title}</h4>
        {description && <p className="mt-1 text-sm font-medium text-[#94A3B8]">{description}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}
