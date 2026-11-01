"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state">
    <div className="brand"><BrandLogo tone="light"/></div>
    <section className="panel route-state-panel" role="alert">
      <AlertCircle size={30}/>
      <h1>Unable to load this page</h1>
      <p>Your information remains secure. Try loading the page again.</p>
      <button className="button primary" onClick={reset}><RotateCw size={17}/>Try again</button>
    </section>
  </main>;
}

