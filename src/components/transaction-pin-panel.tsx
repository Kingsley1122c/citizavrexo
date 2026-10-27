"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changeTransactionPinAction, setUpTransactionPinAction } from "@/app/user-actions";

const PinInput = ({ name, label, autoComplete }: { name: string; label: string; autoComplete: string }) => (
  <label>{label}<input name={name} type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete={autoComplete} required /></label>
);

export function TransactionPinPanel({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(configured ? changeTransactionPinAction : setUpTransactionPinAction, {});
  return (
    <form action={action} className="form-grid modal-form">
      {configured && <PinInput name="currentPin" label="Current PIN" autoComplete="current-password" />}
      <PinInput name={configured ? "newPin" : "pin"} label={configured ? "New PIN" : "Create PIN"} autoComplete="new-password" />
      <PinInput name="confirmation" label="Confirm PIN" autoComplete="new-password" />
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      {state.success && <p className="auth-message success" role="status">{state.success}</p>}
      <button className="button secondary full" disabled={pending} aria-busy={pending}>{pending ? "Saving..." : configured ? "Change transaction PIN" : "Set up transaction PIN"}</button>
      {configured && <Link href="/forgot-password" className="note">Forgot PIN? Recover your account using your verified email.</Link>}
    </form>
  );
}
