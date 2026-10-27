import { AdminApp } from "@/components/admin-app";
import { requirePermission } from "@/lib/auth/authorization";
import { permissionsFor } from "@/lib/auth/permissions";
import { getAdminWorkspace } from "@/lib/repositories/workspace-repository";

export const runtime = "nodejs";

export default async function AdminPage() {
	const identity = await requirePermission("admin.dashboard.read");
	if (!identity.adminRole) throw new Error("Administrator role was not found.");
	return <AdminApp identity={{ id: identity.id, name: identity.name, role: identity.adminRole, permissions: [...permissionsFor(identity.adminRole)] }} data={await getAdminWorkspace(identity.adminRole)}/>;
}