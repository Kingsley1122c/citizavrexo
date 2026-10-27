import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { DeploymentGuard } from "@/components/deployment-guard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Nivora Core", template: "%s | Nivora Core" },
  description: "Banking made beautifully simple.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const deploymentId = process.env.RENDER_GIT_COMMIT ?? "development";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full"><DeploymentGuard deploymentId={deploymentId} />{children}</body>
    </html>
  );
}
