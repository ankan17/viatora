import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "min-h-11 w-full rounded-sm border border-outline bg-raised px-3 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-plum";

export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: ReactNode; error?: string; id: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        {...props}
      />
      {(error || hint) && (
        <p id={`${id}-note`} className={cn("text-caption", error ? "text-plum font-bold" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label, id, className, ...props }: ComponentProps<"textarea"> & { label: string; id: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <textarea id={id} className={cn(inputClass, "min-h-20 py-2")} {...props} />
    </div>
  );
}

export function Select({ label, id, className, children, ...props }: ComponentProps<"select"> & { label: string; id: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <select id={id} className={inputClass} {...props}>
        {children}
      </select>
    </div>
  );
}
