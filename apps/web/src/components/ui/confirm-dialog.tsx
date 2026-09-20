import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "./button.js";
import { cn } from "@/lib/cn.js";

/**
 * Built on the native <dialog>, which brings the focus trap, Escape to close
 * and the backdrop with it. No dialog library needed for a yes/no question.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Read inside a native listener that is attached once, so it always sees the
  // current values without resubscribing.
  const latest = useRef({ open, busy, onCancel });
  latest.current = { open, busy, onCancel };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    // "close" rather than React's onCancel: the cancel event does not bubble,
    // so React's delegated handler never runs and Escape would do nothing.
    // Letting the dialog close itself and reacting to it also covers the
    // browser closing it for any other reason.
    const handleClose = () => {
      if (latest.current.open) latest.current.onCancel();
    };

    element.addEventListener("close", handleClose);
    return () => element.removeEventListener("close", handleClose);
  }, []);

  return (
    <dialog
      ref={dialog}
      onClick={(event) => {
        // A modal dialog fills the viewport; a click that lands on the element
        // itself rather than the card inside it is a click on the backdrop.
        if (event.target === dialog.current && !busy) dialog.current?.close();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-0 text-slate-900",
        "backdrop:bg-slate-900/40",
      )}
    >
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-slate-600">{children}</div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => dialog.current?.close()}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
