import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { requirePermission } from "@/lib/auth/authorization";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { resolveStorageConfiguration } from "@/lib/storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const administrator = await requirePermission("settings.manage");
  if (administrator.adminRole !== "super_admin") return new Response("Forbidden", { status: 403 });

  const sourcePath = resolveStorageConfiguration().databaseUrl.slice("file:".length);
  const snapshotPath = join(tmpdir(), `citizavrexo-migration-${randomUUID()}.db`);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(snapshotPath);
    const snapshot = await readFile(snapshotPath);
    await appendAuditEvent({
      actorId: administrator.id,
      actorLabel: administrator.email,
      action: "storage.migration_export",
      target: "citizavrexo.db",
      result: "success",
    });
    return new Response(new Uint8Array(snapshot), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Disposition": `attachment; filename="citizavrexo-migration-${new Date().toISOString().slice(0, 10)}.db"`,
        "Content-Type": "application/vnd.sqlite3",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    source.close();
    await rm(snapshotPath, { force: true });
  }
}