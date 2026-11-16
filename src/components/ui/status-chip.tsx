import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/cn";

type Status = Database["public"]["Enums"]["item_status"];

// Status is told apart by lightness and shape, not hue alone (see design system README).
const styles: Record<Status, string> = {
  idea: "bg-raised text-muted border border-dashed border-outline",
  planned: "bg-blush text-plum",
  booked: "bg-ink text-ground",
};

const labels: Record<Status, string> = { idea: "Idea", planned: "Planned", booked: "Booked" };

export function StatusChip({ status }: { status: Status }) {
  return <span className={cn("inline-flex h-6 items-center rounded-lg px-2 text-label", styles[status])}>{labels[status]}</span>;
}
