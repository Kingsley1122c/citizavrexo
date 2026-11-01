import { BrandLogo } from "@/components/brand-logo";

export default function Loading() {
  return <main className="route-state" aria-busy="true" aria-label="Loading CITIZAVREXO">
    <div className="brand"><BrandLogo tone="light"/></div>
    <section className="panel route-state-panel">
      <span className="loading-mark"/>
      <h1>Loading your workspace</h1>
      <p>Your account information is being prepared securely.</p>
    </section>
  </main>;
}

