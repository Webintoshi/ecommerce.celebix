"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxChangeEvent = {
  target: {
    checked: boolean
  }
}

type CheckboxBaseProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "onChange"
>

interface CheckboxProps extends CheckboxBaseProps {
  label?: string
  count?: number
  onChange?: (event: CheckboxChangeEvent) => void
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, label, count, onChange, checked, ...props }, ref) => {
  const handleCheckedChange = React.useCallback(
    (nextValue: boolean | "indeterminate") => {
      onChange?.({
        target: {
          checked: nextValue === true,
        },
      })
    },
    [onChange],
  )

  const checkbox = (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={checked}
      onCheckedChange={handleCheckedChange}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (!label && count === undefined) {
    return checkbox
  }

  return (
    <label className="flex items-center gap-3 text-sm text-[#0F1626]">
      {checkbox}
      <span className="flex-1">{label}</span>
      {count !== undefined ? <span className="text-xs text-[#8A6B37]">{count}</span> : null}
    </label>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
