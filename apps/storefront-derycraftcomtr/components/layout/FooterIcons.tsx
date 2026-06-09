import { cn } from "@/lib/utils";

type FooterIconProps = {
  className?: string;
  size?: number;
};

const STROKE = 1.5;

function iconSize(size: number) {
  return { width: size, height: size };
}

export function FooterIconInstagram({ className, size = 20 }: FooterIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4.5"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <circle cx="12" cy="12" r="3.75" stroke="currentColor" strokeWidth={STROKE} />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function FooterIconYoutube({ className, size = 20 }: FooterIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M20.2 7.4a2.2 2.2 0 0 0-1.55-1.56C17.1 5.5 12 5.5 12 5.5s-5.1 0-6.65.34A2.2 2.2 0 0 0 3.8 7.4 23 23 0 0 0 3.5 12a23 23 0 0 0 .3 4.6 2.2 2.2 0 0 0 1.55 1.56C6.9 18.5 12 18.5 12 18.5s5.1 0 6.65-.34a2.2 2.2 0 0 0 1.55-1.56A23 23 0 0 0 20.5 12a23 23 0 0 0-.3-4.6Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M10.5 9.8v4.4l3.8-2.2-3.8-2.2Z" fill="currentColor" />
    </svg>
  );
}

export function FooterIconMail({ className, size = 18 }: FooterIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <path
        d="M4 7.5 12 12.5l8-5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
