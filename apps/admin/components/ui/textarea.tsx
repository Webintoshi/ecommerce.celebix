import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
        <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-[1.45rem] border border-[var(--admin-border)] bg-white px-[1.125rem] py-3.5 text-base leading-6 text-[var(--admin-text)] ring-offset-background placeholder:text-[var(--admin-text-muted)] shadow-[0_6px_18px_rgba(17,24,39,0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,106,0,0.12)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[96px] md:px-4 md:py-2.5 md:text-sm md:rounded-2xl",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
