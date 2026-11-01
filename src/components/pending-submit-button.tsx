"use client";

import { useFormStatus } from "react-dom";
import { BrandedStatus } from "@/components/branded-status";

export function PendingSubmitButton({ idleLabel, pendingLabel, className = "button primary auth-submit" }: { idleLabel: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-busy={pending}>
    {pending ? <BrandedStatus compact message={pendingLabel} /> : idleLabel}
  </button>;
}