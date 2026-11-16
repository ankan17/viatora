import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-sm px-4 font-sans text-body font-bold transition-[opacity,background-color] disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  // The one thing to do next.
  primary: "bg-plum text-on-plum hover:opacity-90",
  secondary: "border border-outline bg-raised text-ink hover:bg-blush",
  ghost: "text-plum hover:bg-blush",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cn(base, variants[variant], className);
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
