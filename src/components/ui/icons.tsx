import type { SVGProps } from "react";

// 2px stroke, round caps and joins, per the design system.
function Icon({ d, ...props }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d={d} />
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;
export const ChevronLeft = (p: P) => <Icon d="M15 5l-7 7 7 7" {...p} />;
export const ChevronUp = (p: P) => <Icon d="M6 15l6-6 6 6" {...p} />;
export const Close = (p: P) => <Icon d="M6 6l12 12M18 6L6 18" {...p} />;
export const Plus = (p: P) => <Icon d="M12 5v14M5 12h14" {...p} />;
export const More = (p: P) => <Icon d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} {...p} />;
export const ArrowUp = (p: P) => <Icon d="M12 19V5M6 11l6-6 6 6" {...p} />;
export const ArrowDown = (p: P) => <Icon d="M12 5v14M6 13l6 6 6-6" {...p} />;
export const Chat = (p: P) => <Icon d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" {...p} />;
export const Settings = (p: P) => (
  <Icon d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" {...p} />
);
