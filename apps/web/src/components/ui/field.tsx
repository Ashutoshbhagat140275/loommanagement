import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/cn.js";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl bg-white px-4 text-base text-slate-900 ring-1 ring-slate-300 transition placeholder:text-slate-400",
        "focus:ring-2 focus:ring-slate-900 focus:outline-none",
        "aria-[invalid=true]:ring-red-500",
        className,
      )}
      {...props}
    />
  );
}

type FieldProps = {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
};

/** Label, control and error message, wired together for screen readers. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": messageId,
      })}
      {error ? (
        <p id={messageId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
    >
      {children}
    </p>
  );
}
