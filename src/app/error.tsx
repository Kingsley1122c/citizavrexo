"use client";

import { RotateCw } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BrandedStatus } from "@/components/branded-status";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state">
    <div className="brand"><BrandLogo tone="light"/></div>
    <section className="panel route-state-panel" role="alert">
      <BrandedStatus variant="error" message="Unable to load this page" detail="Your information remains secure. Try loading the page again." />
      <button className="button primary" onClick={reset}><RotateCw size={17}/>Try again</button>
    </section>
  </main>;
}

