"use client";

import { Trash2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteUserAction } from "@/app/admin-actions";
import type { User } from "@/lib/domain";

export function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(deleteUserAction, {});
  return <>
    <button className="icon-button destructive-icon" type="button" aria-label={`Delete ${user.name}`} title={`Delete ${user.name}`} onClick={() => setOpen(true)}><Trash2 size={16}/></button>
    {open && <div className="modal-backdrop" role="presentation"><section className="modal danger-modal" role="dialog" aria-modal="true" aria-labelledby={`delete-${user.id}`}><div className="panel-title"><div><span className="eyebrow danger-text">DESTRUCTIVE ACTION</span><h2 id={`delete-${user.id}`}>Delete user</h2></div><button className="icon-button" type="button" aria-label="Close deletion confirmation" onClick={() => setOpen(false)}><X size={18}/></button></div><p>This permanently removes sign-in access and anonymizes the user while preserving required financial and audit history.</p><div className="delete-target"><b>{user.name}</b><span>{user.email}</span></div><form action={action} className="review-form"><input type="hidden" name="targetUserId" value={user.id}/><label>Type <b>DELETE USER</b> to confirm<input name="confirmation" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/></label><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button danger" disabled={pending || confirmation !== "DELETE USER"}><Trash2 size={16}/>{pending ? "Deleting..." : "Delete user"}</button></div></form>{state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.success && <p className="auth-message success" role="status">{state.success}</p>}</section></div>}
  </>;
}
