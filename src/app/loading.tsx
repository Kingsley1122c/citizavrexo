import { BrandedStatus } from "@/components/branded-status";
import { BrandLogo } from "@/components/brand-logo";

export default function Loading() {
  return <main className="route-state" aria-busy="true" aria-label="Loading CITIZAVREXO">
    <div className="brand"><BrandLogo tone="light"/></div>
    <section className="panel route-state-panel">
      <BrandedStatus message="Securing your session..." detail="Almost ready..." />
    </section>
  </main>;
}

