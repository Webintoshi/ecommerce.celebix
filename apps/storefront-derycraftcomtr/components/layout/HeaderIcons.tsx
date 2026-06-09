import { cn } from "@/lib/utils";

type HeaderIconProps = {
  className?: string;
  size?: number;
};

const STROKE = 1.65;

function iconSize(size: number) {
  return { width: size, height: size };
}

export function HeaderIconSearch({ className, size = 22 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <circle cx="10.75" cy="10.75" r="6.75" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M16.25 16.25L21 21"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeaderIconAccount({ className, size = 22 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <circle cx="12" cy="8.25" r="3.35" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M5.75 19.25c.95-3.1 3.35-4.75 6.25-4.75s5.3 1.65 6.25 4.75"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeaderIconBag({ className, size = 22 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M7.5 8.25V7a4.5 4.5 0 0 1 9 0v1.25"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d="M6 8.25h12l-.85 11.1a1.25 1.25 0 0 1-1.24 1.15H8.09a1.25 1.25 0 0 1-1.24-1.15L6 8.25Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeaderIconMenu({ className, size = 22 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path d="M5 7.5h14" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M5 16.5h14" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function HeaderIconClose({ className, size = 22 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path d="M7 7l10 10" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M17 7 7 17" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function HeaderIconChevron({ className, size = 12 }: HeaderIconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...iconSize(size)}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
