import type { Metadata } from "next";
import { connection } from "next/server";
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
  metadataBase: new URL("https://citizavrexo.com"),
  title: { default: "Citizavrexo", template: "%s | Citizavrexo" },
  description: "Banking made beautifully simple.",
  openGraph: {
    title: "Citizavrexo",
    description: "Banking made beautifully simple.",
    url: "https://citizavrexo.com",
    siteName: "Citizavrexo",
    images: [{ url: "/brand/og-citizavrexo.png", width: 1200, height: 630, alt: "Citizavrexo premium identity" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Citizavrexo",
    description: "Banking made beautifully simple.",
    images: ["/brand/og-citizavrexo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.svg"],
  },
  manifest: "/site.webmanifest",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const deploymentId = process.env.RENDER_GIT_COMMIT ?? "development";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <DeploymentGuard deploymentId={deploymentId} />
        {children}
      </body>
    </html>
  );
}

