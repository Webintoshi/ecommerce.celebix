import { cn } from "@/lib/utils";

type IconProps = {
  className?: string;
  size?: number;
};

const STROKE = 1.55;

function iconSize(size: number) {
  return { width: size, height: size };
}

export function FloatingFaqChatIcon({
  className,
  size = 30,
  dotColor = "#4A90E2",
}: IconProps & { dotColor?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      width={size}
      height={size}
    >
      <path
        fill="#ffffff"
        d="M9 8.25h14a3 3 0 0 1 3 3v5.75a3 3 0 0 1-3 3h-6.1l-3.9 2.85V19.5H9a3 3 0 0 1-3-3v-5.75a3 3 0 0 1 3-3z"
      />
      <circle cx="12.5" cy="14.25" r="1.5" fill={dotColor} />
      <circle cx="16" cy="14.25" r="1.5" fill={dotColor} />
      <circle cx="19.5" cy="14.25" r="1.5" fill={dotColor} />
    </svg>
  );
}

export function FloatingIconMessage({ className, size = 22 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M5.5 6.5h13a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H11l-4.5 3v-3H5.5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M9 11.5h6" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M9 14h3.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function FloatingIconClose({ className, size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path d="M8 8l8 8" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M16 8l-8 8" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function FloatingIconExternal({ className, size = 14 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M8.5 15.5 15.5 8.5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d="M9.5 8.5h6v6"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 8.5h-2v9h9v-2"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FloatingIconWhatsApp({ className, size = 18 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M12 4.5a7.5 7.5 0 0 0-6.52 11.28L4.5 19.5l3.9-1.02A7.5 7.5 0 1 0 12 4.5Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M9.4 9.6c.18-.42.37-.43.54-.44h.39c.12 0 .28-.05.43.32.16.38.54 1.32.59 1.42.05.1.08.22-.01.35-.09.14-.14.22-.28.36-.14.14-.29.31-.41.42-.14.12-.28.25-.12.49.16.24.72 1.18 1.54 1.91 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.2.69-.8.87-1.08.18-.27.37-.23.62-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.11.07.66-.15 1.3-.22.64-1.28 1.22-1.78 1.3-.46.08-1.04.12-1.68-.12-.52-.2-1.18-.43-2.03-1.02-.88-.62-1.47-1.28-1.67-1.5-.2-.22-1.4-1.83-1.4-3.5 0-1.66.86-2.48 1.17-2.82.3-.34.66-.42.88-.42.22 0 .44.01.63.01.2 0 .47-.08.73.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FloatingIconInstagram({ className, size = 18 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <rect
        x="4.5"
        y="4.5"
        width="15"
        height="15"
        rx="4.25"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <circle cx="12" cy="12" r="3.35" stroke="currentColor" strokeWidth={STROKE} />
      <circle cx="17.15" cy="6.85" r="0.85" fill="currentColor" />
    </svg>
  );
}

export function FloatingIconForm({ className, size = 18 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M6.5 5.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <path d="M8 10h8" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M8 13.5h5.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}
