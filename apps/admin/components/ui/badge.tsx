import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)] hover:bg-[#ffe7d7]",
        secondary:
          "border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] hover:bg-[var(--admin-bg)]",
        destructive:
          "border-[color:rgba(239,68,68,0.14)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)] hover:bg-[#fde3e3]",
        outline: "border-[var(--admin-border)] bg-transparent text-[var(--admin-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
