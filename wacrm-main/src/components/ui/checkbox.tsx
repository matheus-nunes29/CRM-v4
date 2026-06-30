"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Minus } from "lucide-react"
import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      style={{ width: 16, height: 16, minWidth: 16, minHeight: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className={cn(
        "shrink-0 cursor-pointer rounded-[3px] border border-zinc-300 bg-white transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:border-primary data-[checked]:bg-primary",
        "data-[indeterminate]:border-primary data-[indeterminate]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        {props.indeterminate ? (
          <Minus style={{ width: 10, height: 10, color: 'white', strokeWidth: 2.5 }} />
        ) : (
          <svg
            viewBox="0 0 11 9"
            style={{ width: 11, height: 11, color: 'white' }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1,4.5 4,7.5 10,1" />
          </svg>
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
