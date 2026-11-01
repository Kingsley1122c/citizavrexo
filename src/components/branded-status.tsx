import { AlertCircle, Check } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type BrandedStatusProps = {
  variant?: "loading" | "success" | "error";
  message: string;
  detail?: string;
  compact?: boolean;
  className?: string;
};

export function BrandedStatus({ variant = "loading", message, detail, compact = false, className = "" }: BrandedStatusProps) {
  return <div className={`branded-status branded-status-${variant}${compact ? " branded-status-compact" : ""} ${className}`.trim()} role={variant === "error" ? "alert" : "status"} aria-live="polite" aria-busy={variant === "loading"}>
    <span className="branded-status-mark" aria-hidden="true">
      {variant === "loading" ? <BrandLogo variant="symbol" size={compact ? "sm" : "lg"} /> : variant === "success" ? <Check size={compact ? 15 : 24} /> : <AlertCircle size={compact ? 15 : 24} />}
    </span>
    <span className="branded-status-copy"><b>{message}</b>{detail && <small>{detail}</small>}</span>
    {variant === "loading" && !compact && <span className="branded-status-track" aria-hidden="true"><i /></span>}
  </div>;
}

export function DashboardSkeleton() {
  return <main className="dashboard-loading" aria-label="Preparing your dashboard" aria-busy="true">
    <aside className="dashboard-skeleton-sidebar"><BrandLogo tone="light" /><div className="skeleton-nav">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div></aside>
    <section className="dashboard-skeleton-main">
      <header><BrandLogo variant="symbol" /><span className="skeleton-circle" /></header>
      <div className="dashboard-skeleton-content">
        <BrandedStatus message="Preparing your dashboard..." detail="Your secure account information is loading." />
        <div className="skeleton-heading"><i /><i /></div>
        <div className="skeleton-dashboard-grid"><div className="skeleton-block skeleton-balance" /><div className="skeleton-block" /></div>
        <div className="skeleton-actions">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
        <div className="skeleton-content-grid"><div className="skeleton-block" /><div className="skeleton-block" /></div>
      </div>
    </section>
  </main>;
}