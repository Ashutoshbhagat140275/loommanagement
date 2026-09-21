import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn.js";

// Sizes are deliberately large: these are tapped on a phone, often by someone
// standing at a loom.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-base font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white hover:bg-slate-800",
        outline: "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50",
        ghost: "text-slate-700 hover:bg-slate-100",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        default: "h-12 px-5",
        lg: "h-14 px-6 text-lg",
        sm: "h-10 px-4 text-sm",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}
