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
  const primary = tone === "light" ? "var(--brand-ivory)" : "var(--brand-navy)";
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
      <path fill={primary} fillRule="evenodd" d="M51 8H25C15.61 8 8 15.61 8 25v14c0 9.39 7.61 17 17 17h26l-8-12H26a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6h17L51 8Z" />
      <path d="M26 15h-1c-6.08 0-11 4.92-11 11v12c0 6.08 4.92 11 11 11h1" fill="none" stroke="var(--brand-teal)" strokeWidth="3" strokeLinecap="square" />
      <path d="M46 8h5l-8 12h-5L46 8ZM38 44h5l8 12h-5l-8-12Z" fill="var(--brand-gold)" />
    </svg>
  );
}

export function BrandLogo({ tone = "dark", variant = "horizontal", size = "md", className = "", ariaLabel = "Citizavrexo" }: BrandLogoProps) {
  if (variant === "symbol") {
    return (
      <span className={`brand-logo ${className}`.trim()} data-tone={tone} role="img" aria-label={ariaLabel}>
        <BrandSymbol tone={tone} size={size} />
      </span>
    );
  }

  return (
    <span className={`brand-logo ${className}`.trim()} data-tone={tone} role="img" aria-label={ariaLabel}>
      <BrandSymbol tone={tone} size={size} />
      <span className="brand-logo-wordmark">
        <strong>CITIZAVREXO</strong>
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
