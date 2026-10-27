import type { Metadata } from "next";
import { AdministratorTransferForm } from "@/components/administrator-transfer-form";

export const metadata: Metadata = { title: "Administrator transfer · Nivora Core", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AdministratorTransferPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AdministratorTransferForm token={token ?? ""}/>;
}