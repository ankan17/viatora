import { cn } from "@/lib/cn";

/** A radio group drawn as chips. The checked chip is filled with ink. */
export function ChoiceChips<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 opacity-0"
            />
            <span
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-caption font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plum",
                value === o.value ? "border-ink bg-ink text-ground" : "border-outline bg-raised text-ink",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
