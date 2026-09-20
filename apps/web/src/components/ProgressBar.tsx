import { cn } from "@/lib/cn.js";

export function ProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const fraction = total > 0 ? done / total : 0;
  const percent = Math.min(100, Math.round(fraction * 100));

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            // Past the saree's length: worth seeing, not worth an error.
            done > total ? "bg-amber-500" : "bg-slate-900",
          )}
          style={{ width: `${Math.max(percent, done > 0 ? 3 : 0)}%` }}
        />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
