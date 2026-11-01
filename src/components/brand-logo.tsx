import Link from "next/link";

type BrandTone = "light" | "dark";
type BrandVariant = "horizontal" | "symbol";

type BrandLogoProps = {
  tone?: BrandTone;
  variant?: BrandVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
};

const sizeMap = {
  sm: 22,
  md: 28,
  lg: 34,
} as const;

function BrandSymbol({ tone = "dark", size = "md" }: { tone?: BrandTone; size?: "sm" | "md" | "lg" }) {
  const px = sizeMap[size];
  return (
    <svg
      className="brand-logo-symbol"
      viewBox="0 0 64 64"
      width={px}
      height={px}
      aria-hidden="true"
      focusable="false"
      data-tone={tone}
    >
      <defs>
        <linearGradient id="citizavrexo-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-teal)" />
          <stop offset="100%" stopColor="var(--brand-teal-strong)" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="16" fill="var(--brand-navy)" />
      <path d="M18 40c0-8.8 7.2-16 16-16h12" fill="none" stroke="url(#citizavrexo-accent)" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M46 24l-4.8-4.8M46 24l-4.8 4.8" fill="none" stroke="var(--brand-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="40" r="4.7" fill="var(--brand-gold)" />
      <circle cx="47" cy="40" r="4.7" fill="var(--brand-teal)" />
      <rect x="3" y="3" width="58" height="58" rx="16" fill="none" stroke="var(--brand-navy-border)" strokeWidth="1.2" />
    </svg>
  );
}

export function BrandLogo({ tone = "dark", variant = "horizontal", size = "md", className = "", ariaLabel = "Citizavrexo" }: BrandLogoProps) {
  if (variant === "symbol") {
    return (
      <span className={`brand-logo ${className}`.trim()} data-tone={tone} aria-label={ariaLabel}>
        <BrandSymbol tone={tone} size={size} />
      </span>
    );
  }

  return (
    <span className={`brand-logo ${className}`.trim()} data-tone={tone} aria-label={ariaLabel}>
      <BrandSymbol tone={tone} size={size} />
      <span className="brand-logo-wordmark">
        <strong>Citizavrexo</strong>
      </span>
    </span>
  );
}

export function BrandLink({ href = "/", tone = "dark", className = "" }: { href?: string; tone?: BrandTone; className?: string }) {
  return (
    <Link className={`brand-logo-link ${className}`.trim()} href={href} aria-label="Citizavrexo home">
      <BrandLogo tone={tone} variant="horizontal" size="md" />
    </Link>
  );
}
