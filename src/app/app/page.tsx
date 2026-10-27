import { redirect } from "next/navigation";
import { NivoraApp } from "@/components/nivora-app";
import { requireUser } from "@/lib/auth/authorization";
import { getUserWorkspace } from "@/lib/repositories/workspace-repository";

export const runtime = "nodejs";

export default async function CustomerWorkspace() {
  const identity = await requireUser();
  if (identity.adminRole) redirect("/admin");
  const workspace = await getUserWorkspace(identity.id, identity.sessionId);
  if (!workspace) throw new Error("Authenticated user record was not found.");
  return <NivoraApp data={workspace} />;
}
