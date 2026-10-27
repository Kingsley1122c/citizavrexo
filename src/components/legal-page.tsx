import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/public-site-chrome";

export function LegalPage({ eyebrow, title, introduction, children }: { eyebrow: string; title: string; introduction: string; children: ReactNode }) {
  return <main className="landing-page legal-page">
    <PublicHeader/>
    <header className="legal-hero">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{introduction}</p>
      <small>Last updated September 14, 2026</small>
    </header>
    <article className="legal-document">{children}</article>
    <PublicFooter/>
  </main>;
}